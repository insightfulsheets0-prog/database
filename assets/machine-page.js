// =========================================================
// Komponen Alpine.js generik untuk halaman per-mesin.
// Fitur: timer Start/Stop, routing WIP/FG + nomor, dropdown
// Part Number & Problem (otomatis nambah kalau baru), dan
// antrian offline (data ketampung lokal kalau tidak ada jaringan).
// =========================================================

// ---------- Utilitas antrian offline (localStorage, dipakai semua mesin) ----------
const OFFLINE_QUEUE_KEY = "offline_queue_v1";

function loadOfflineQueue() {
  try {
    const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveOfflineQueue(queue) {
  try {
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // storage penuh/tidak tersedia — abaikan, tidak fatal
  }
}

function enqueueOffline(table, payload) {
  const queue = loadOfflineQueue();
  queue.push({
    localId: "local_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8),
    table,
    payload,
    created_at: new Date().toISOString(),
  });
  saveOfflineQueue(queue);
  return queue;
}

// Dipanggil saat online kembali / berkala — coba kirim semua antrian ke Supabase
async function trySyncOfflineQueue() {
  let queue = loadOfflineQueue();
  if (queue.length === 0) return { synced: 0, remaining: 0 };
  let synced = 0;
  const remaining = [];
  for (const item of queue) {
    try {
      const { error } = await supabaseClient.from(item.table).insert(item.payload);
      if (error) throw error;
      synced++;
    } catch {
      remaining.push(item); // gagal (masih offline / error lain) → simpan lagi, coba nanti
    }
  }
  saveOfflineQueue(remaining);
  return { synced, remaining: remaining.length };
}

// Deteksi error jaringan (offline) vs error lain (mis. validasi/RLS)
function isNetworkError(err) {
  if (!navigator.onLine) return true;
  const msg = (err && err.message) || String(err);
  return /fetch|network|failed to fetch/i.test(msg);
}

function nowIso() {
  return new Date().toISOString();
}

function fmtClock(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

// =========================================================
// Komponen utama halaman mesin
// machineKey: 'tandem' | 'blanking' | 'transfer_2000t' | 'transfer_800t' | 'pc200t'
// extraFields: kolom tambahan generik (mis. Blanking: top_coil, berat_coil)
// routingMax: 0 = tidak ada fitur routing; 8 = Tandem; 2 = PC200t
// =========================================================
function machinePage(machineKey, machineLabel, extraFields, routingMax) {
  return {
    // ---- state umum ----
    session: null,
    profile: null,
    tab: "produksi",
    loading: true,
    errorMsg: "",
    successMsg: "",
    extraFields,
    routingMax: routingMax || 0,
    mobileNavOpen: false,

    // ---- data tabel ----
    productionRows: [],
    downtimeRows: [],

    // ---- dropdown master data ----
    partNumberOptions: [],
    problemOptions: [],

    // ---- offline ----
    isOnline: navigator.onLine,
    pendingCount: 0,
    syncing: false,

    // ---- form & timer PRODUKSI ----
    editingProductionId: null,
    prodState: "idle", // 'idle' | 'running' | 'stopped'
    prodStart: null,
    prodEnd: null,
    productionForm: {},
    routingType: null, // 'WIP' | 'FG'
    routingNumbers: [],

    // ---- form & timer DOWNTIME ----
    editingDowntimeId: null,
    dtState: "idle",
    dtStart: null,
    dtEnd: null,
    downtimeForm: {},

    async init() {
      this.session = await requireAuth();
      if (!this.session) return;

      window.addEventListener("online", () => { this.isOnline = true; this.syncNow(); });
      window.addEventListener("offline", () => { this.isOnline = false; });
      this.refreshPendingCount();
      setInterval(() => this.syncNow(), 20000);

      try {
        const { data: profile, error: profileError } = await supabaseClient
          .from("profiles")
          .select("*")
          .eq("id", this.session.user.id)
          .maybeSingle();
        if (profileError) throw profileError;
        this.profile = profile;

        this.resetProductionForm();
        this.resetDowntimeForm();
        await Promise.all([
          this.fetchProduction(),
          this.fetchDowntime(),
          this.fetchPartNumbers(),
          this.fetchProblems(),
        ]);
        await this.syncNow();
      } catch (err) {
        this.flash("Gagal memuat halaman: " + (err.message || err), true);
      } finally {
        this.loading = false;
      }
    },

    flash(msg, isError = false) {
      if (isError) { this.errorMsg = msg; this.successMsg = ""; }
      else { this.successMsg = msg; this.errorMsg = ""; }
      setTimeout(() => { this.errorMsg = ""; this.successMsg = ""; }, 3500);
    },

    refreshPendingCount() {
      this.pendingCount = loadOfflineQueue().filter(
        (i) => i.payload.mesin === machineKey
      ).length;
    },

    async syncNow() {
      if (this.syncing || !navigator.onLine) return;
      this.syncing = true;
      const { synced } = await trySyncOfflineQueue();
      this.syncing = false;
      this.refreshPendingCount();
      if (synced > 0) {
        this.flash(synced + " data offline berhasil disinkron.");
        await Promise.all([this.fetchProduction(), this.fetchDowntime()]);
      }
    },

    // ================= MASTER DATA (dropdown) =================
    async fetchPartNumbers() {
      const { data, error } = await supabaseClient
        .from("part_numbers")
        .select("value")
        .eq("mesin", machineKey)
        .order("value");
      if (!error && data) this.partNumberOptions = data.map((r) => r.value);
    },

    async fetchProblems() {
      const { data, error } = await supabaseClient
        .from("downtime_problems")
        .select("value")
        .eq("mesin", machineKey)
        .order("value");
      if (!error && data) this.problemOptions = data.map((r) => r.value);
    },

    async learnPartNumber(value) {
      if (!value) return;
      if (this.partNumberOptions.some((v) => v.toLowerCase() === value.toLowerCase())) return;
      const { error } = await supabaseClient
        .from("part_numbers")
        .insert({ mesin: machineKey, value });
      if (!error) this.partNumberOptions.push(value);
    },

    async learnProblem(value) {
      if (!value) return;
      if (this.problemOptions.some((v) => v.toLowerCase() === value.toLowerCase())) return;
      const { error } = await supabaseClient
        .from("downtime_problems")
        .insert({ mesin: machineKey, value });
      if (!error) this.problemOptions.push(value);
    },

    // ================= ROUTING (Tandem & PC200t) =================
    setRoutingType(type) {
      this.routingType = type;
      this.routingNumbers = [];
    },
    toggleRoutingNumber(n) {
      const i = this.routingNumbers.indexOf(n);
      if (i === -1) this.routingNumbers.push(n);
      else this.routingNumbers.splice(i, 1);
    },
    routingRange() {
      return Array.from({ length: this.routingMax }, (_, i) => i + 1);
    },

    // ================= PRODUKSI =================
    resetProductionForm() {
      const base = {
        part_number: "", qty: "", ng: "", kategori_ng: "", break_menit: "",
      };
      this.extraFields.forEach((f) => (base[f.key] = ""));
      this.productionForm = base;
      this.editingProductionId = null;
      this.prodState = "idle";
      this.prodStart = null;
      this.prodEnd = null;
      this.routingType = null;
      this.routingNumbers = [];
    },

    startProduction() {
      this.prodState = "running";
      this.prodStart = nowIso();
    },
    stopProduction() {
      this.prodState = "stopped";
      this.prodEnd = nowIso();
    },
    cancelProductionTimer() {
      this.resetProductionForm();
    },

    async fetchProduction() {
      const { data, error } = await supabaseClient
        .from("production_log")
        .select("*")
        .eq("mesin", machineKey)
        .order("waktu_awal", { ascending: false })
        .limit(200);
      if (error) { this.flash("Gagal memuat data produksi: " + error.message, true); return; }
      this.productionRows = data;
    },

    editProduction(row) {
      this.editingProductionId = row.id;
      this.prodState = "stopped"; // mode edit selalu tampilkan form lengkap dgn waktu manual
      this.prodStart = row.waktu_awal;
      this.prodEnd = row.waktu_akhir;
      this.productionForm = {
        part_number: row.part_number || "",
        qty: row.qty ?? "",
        ng: row.ng ?? "",
        kategori_ng: row.kategori_ng || "",
        break_menit: row.break_menit ?? "",
      };
      this.extraFields.forEach((f) => (this.productionForm[f.key] = row.extra?.[f.key] ?? ""));
      this.routingType = row.extra?.routing_type || null;
      this.routingNumbers = row.extra?.routing_numbers || [];
      this.tab = "produksi";
      window.scrollTo({ top: 0, behavior: "smooth" });
    },

    async submitProduction() {
      const f = this.productionForm;
      if (!this.prodStart || !this.prodEnd) {
        this.flash("Klik Mulai lalu Selesai dulu untuk catat waktunya.", true);
        return;
      }
      const extra = {};
      this.extraFields.forEach((field) => { extra[field.key] = f[field.key] === "" ? null : f[field.key]; });
      if (this.routingMax > 0) {
        extra.routing_type = this.routingType;
        extra.routing_numbers = this.routingNumbers;
      }

      const payload = {
        mesin: machineKey,
        waktu_awal: this.prodStart,
        waktu_akhir: this.prodEnd,
        part_number: f.part_number || null,
        qty: f.qty === "" ? null : Number(f.qty),
        ng: f.ng === "" ? null : Number(f.ng),
        kategori_ng: f.kategori_ng || null,
        break_menit: f.break_menit === "" ? null : Number(f.break_menit),
        extra,
      };

      if (f.part_number) this.learnPartNumber(f.part_number);

      if (this.editingProductionId) {
        try {
          const { error } = await supabaseClient
            .from("production_log").update(payload).eq("id", this.editingProductionId);
          if (error) throw error;
          this.flash("Data produksi diperbarui.");
          this.resetProductionForm();
          await this.fetchProduction();
        } catch (err) {
          this.flash("Gagal menyimpan (butuh koneksi untuk edit): " + (err.message || err), true);
        }
        return;
      }

      payload.created_by = this.session.user.id;
      try {
        if (!navigator.onLine) throw new Error("offline");
        const { error } = await supabaseClient.from("production_log").insert(payload);
        if (error) throw error;
        this.flash("Data produksi ditambahkan.");
        this.resetProductionForm();
        await this.fetchProduction();
      } catch (err) {
        if (isNetworkError(err)) {
          enqueueOffline("production_log", payload);
          this.refreshPendingCount();
          this.productionRows.unshift({ ...payload, id: "pending_" + Date.now(), _pending: true });
          this.flash("Tidak ada jaringan — data disimpan di HP, akan disinkron otomatis nanti.");
          this.resetProductionForm();
        } else {
          this.flash("Gagal menyimpan: " + (err.message || err), true);
        }
      }
    },

    async deleteProduction(id) {
      if (String(id).startsWith("pending_")) {
        this.flash("Data ini masih menunggu sinkron, tunggu online dulu sebelum menghapus.", true);
        return;
      }
      if (!confirm("Hapus baris data produksi ini?")) return;
      const { error } = await supabaseClient.from("production_log").delete().eq("id", id);
      if (error) { this.flash("Gagal menghapus: " + error.message, true); return; }
      this.flash("Data produksi dihapus.");
      await this.fetchProduction();
    },

    // ================= DOWNTIME =================
    resetDowntimeForm() {
      this.downtimeForm = { kategori: "", problem: "", penyebab: "", countermeasure: "" };
      this.editingDowntimeId = null;
      this.dtState = "idle";
      this.dtStart = null;
      this.dtEnd = null;
    },

    startDowntime() {
      this.dtState = "running";
      this.dtStart = nowIso();
    },
    stopDowntime() {
      this.dtState = "stopped";
      this.dtEnd = nowIso();
    },
    cancelDowntimeTimer() {
      this.resetDowntimeForm();
    },

    async fetchDowntime() {
      const { data, error } = await supabaseClient
        .from("downtime_log")
        .select("*")
        .eq("mesin", machineKey)
        .order("waktu_awal", { ascending: false })
        .limit(200);
      if (error) { this.flash("Gagal memuat data downtime: " + error.message, true); return; }
      this.downtimeRows = data;
    },

    editDowntime(row) {
      this.editingDowntimeId = row.id;
      this.dtState = "stopped";
      this.dtStart = row.waktu_awal;
      this.dtEnd = row.waktu_akhir;
      this.downtimeForm = {
        kategori: row.kategori || "",
        problem: row.problem || "",
        penyebab: row.penyebab || "",
        countermeasure: row.countermeasure || "",
      };
      this.tab = "downtime";
      window.scrollTo({ top: 0, behavior: "smooth" });
    },

    async submitDowntime() {
      if (!this.dtStart || !this.dtEnd) {
        this.flash("Klik Mulai lalu Selesai dulu untuk catat waktunya.", true);
        return;
      }
      const f = this.downtimeForm;
      const payload = {
        mesin: machineKey,
        waktu_awal: this.dtStart,
        waktu_akhir: this.dtEnd,
        kategori: f.kategori || null,
        problem: f.problem || null,
        penyebab: f.penyebab || null,
        countermeasure: f.countermeasure || null,
      };

      if (f.problem) this.learnProblem(f.problem);

      if (this.editingDowntimeId) {
        try {
          const { error } = await supabaseClient
            .from("downtime_log").update(payload).eq("id", this.editingDowntimeId);
          if (error) throw error;
          this.flash("Data downtime diperbarui.");
          this.resetDowntimeForm();
          await this.fetchDowntime();
        } catch (err) {
          this.flash("Gagal menyimpan (butuh koneksi untuk edit): " + (err.message || err), true);
        }
        return;
      }

      payload.created_by = this.session.user.id;
      try {
        if (!navigator.onLine) throw new Error("offline");
        const { error } = await supabaseClient.from("downtime_log").insert(payload);
        if (error) throw error;
        this.flash("Data downtime ditambahkan.");
        this.resetDowntimeForm();
        await this.fetchDowntime();
      } catch (err) {
        if (isNetworkError(err)) {
          enqueueOffline("downtime_log", payload);
          this.refreshPendingCount();
          this.downtimeRows.unshift({ ...payload, id: "pending_" + Date.now(), _pending: true });
          this.flash("Tidak ada jaringan — data disimpan di HP, akan disinkron otomatis nanti.");
          this.resetDowntimeForm();
        } else {
          this.flash("Gagal menyimpan: " + (err.message || err), true);
        }
      }
    },

    async deleteDowntime(id) {
      if (String(id).startsWith("pending_")) {
        this.flash("Data ini masih menunggu sinkron, tunggu online dulu sebelum menghapus.", true);
        return;
      }
      if (!confirm("Hapus baris data downtime ini?")) return;
      const { error } = await supabaseClient.from("downtime_log").delete().eq("id", id);
      if (error) { this.flash("Gagal menghapus: " + error.message, true); return; }
      this.flash("Data downtime dihapus.");
      await this.fetchDowntime();
    },

    // ================= util tampilan =================
    fmt(iso) {
      if (!iso) return "-";
      const d = new Date(iso);
      return d.toLocaleString("id-ID", {
        day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
      });
    },
    fmtClock,
    durasiMenit(awal, akhir) {
      if (!awal || !akhir) return "-";
      const diff = (new Date(akhir) - new Date(awal)) / 60000;
      return diff >= 0 ? diff + " mnt" : "-";
    },
    routingLabel(row) {
      const t = row.extra?.routing_type;
      const n = row.extra?.routing_numbers;
      if (!t) return "-";
      return t + (n && n.length ? " · " + n.join(",") : "");
    },

    logout,
  };
}

// input[type=datetime-local] (dipakai di mode edit koreksi manual)
function toLocalInput(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
