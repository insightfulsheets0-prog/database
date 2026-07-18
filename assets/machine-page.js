// =========================================================
// Komponen Alpine.js generik untuk halaman per-mesin.
// Fitur: timer Start/Stop per stasiun (Tandem & PC200t bisa jalan
// beberapa part number bersamaan), routing WIP/FG + nomor, dropdown
// Part Number & Problem, antrian offline, dan notifikasi otomatis
// "isi non-produksi dulu" (Dandori/Watari/Stop Line/Other) setiap
// mau mulai produksi lagi kalau ada jeda dari produksi terakhir.
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
    table, payload, created_at: new Date().toISOString(),
  });
  saveOfflineQueue(queue);
  return queue;
}
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
      remaining.push(item);
    }
  }
  saveOfflineQueue(remaining);
  return { synced, remaining: remaining.length };
}
function isNetworkError(err) {
  if (!navigator.onLine) return true;
  const msg = (err && err.message) || String(err);
  return /fetch|network|failed to fetch/i.test(msg);
}
function nowIso() { return new Date().toISOString(); }
function fmtClock(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

// Daftar semua line/mesin — dipakai untuk dropdown "Proses Selanjutnya"
// di Master Data (butuh tahu semua line, bukan cuma mesin halaman ini).
const MACHINE_OPTIONS = [
  { key: "tandem", label: "Tandem" },
  { key: "blanking", label: "Blanking" },
  { key: "transfer_2000t", label: "Transfer 2000t" },
  { key: "transfer_800t", label: "Transfer 800t" },
  { key: "pc200t", label: "PC200t" },
];

// ---------- Dropdown custom (ganti <datalist> bawaan HTML) ----------
// <datalist> HTML render-nya tidak konsisten di HP (kadang jadi list
// geser ke samping, bukan dropdown ke bawah) — jadi dibikin sendiri
// pakai Alpine, tampilannya konsisten di semua device.
document.addEventListener("alpine:init", () => {
  Alpine.data("comboBox", (getOptions, getValue, setValue) => ({
    open: false,
    query: "",
    init() {
      this.query = getValue() || "";
      this.$watch(() => getValue(), (v) => {
        if (v !== this.query) this.query = v || "";
      });
    },
    filtered() {
      const q = (this.query || "").toLowerCase();
      const opts = getOptions() || [];
      if (!q) return opts.slice(0, 50);
      return opts.filter((o) => o.toLowerCase().includes(q)).slice(0, 50);
    },
    select(opt) {
      this.query = opt;
      setValue(opt);
      this.open = false;
    },
    onInput() {
      setValue(this.query);
      this.open = true;
    },
  }));
});

// ---------- Persist state (per mesin) supaya tidak hilang saat pindah halaman ----------
function timerStorageKey(machineKey) { return "timer_state_v2_" + machineKey; }
function saveTimerStateFor(machineKey, state) {
  try { localStorage.setItem(timerStorageKey(machineKey), JSON.stringify(state)); } catch {}
}
function loadTimerStateFor(machineKey) {
  try {
    const raw = localStorage.getItem(timerStorageKey(machineKey));
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

// input[type=datetime-local] (dipakai untuk koreksi manual waktu)
function toLocalInput(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// =========================================================
// Komponen utama halaman mesin
// stationConfig:
//   null / {mode:'none'}                                 -> 1 line implisit (mesin biasa)
//   {mode:'fixed', stations:['PC-1','PC-2']}              -> PC200t
//   {mode:'variant', variants:{lama:[...5], baru:[...5]}} -> Tandem
// =========================================================
function machinePage(machineKey, machineLabel, extraFields, routingMax, kategoriOptions, stationConfig) {
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
    kategoriOptions: kategoriOptions || ["MESIN", "DIES", "OTHER"],
    stationConfig: stationConfig || { mode: "none" },
    tandemVariant: null, // 'lama' | 'baru' — hanya dipakai kalau mode 'variant'
    mobileNavOpen: false,

    // ---- lines produksi, satu entri per stasiun (key: id stasiun / '_single') ----
    lines: {},

    // ---- data tabel ----
    productionRows: [],
    downtimeRows: [],
    nonProduksiRows: [],

    // ---- master data (Part Number & Problem) — {id, value}[] ----
    partNumberList: [],
    problemList: [],
    newPartNumberValue: "",
    newProblemValue: "",
    machineOptions: MACHINE_OPTIONS,
    partNumbersByLine: {}, // cache: {lineKey: [value, ...]} buat dropdown Proses Selanjutnya

    // ---- offline ----
    isOnline: navigator.onLine,
    pendingCount: 0,
    syncing: false,

    // ---- form & timer DOWNTIME (tetap 1 per halaman, tidak per-stasiun) ----
    editingDowntimeId: null,
    dtState: "idle",
    dtStart: null,
    dtEnd: null,
    downtimeForm: {},

    // ---- edit Non-Produksi (cuma lihat & koreksi, tidak ada "mulai manual") ----
    editingNonProduksiId: null,
    nonProduksiEditForm: {},

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

        const restoredDt = this.restoreState();
        if (!restoredDt) this.resetDowntimeForm();
        this.ensureLines();
        this.watchAndAutosave();

        await Promise.all([
          this.fetchProduction(),
          this.fetchDowntime(),
          this.fetchNonProduksi(),
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
      this.pendingCount = loadOfflineQueue().filter((i) => i.payload.mesin === machineKey).length;
    },

    async syncNow() {
      if (this.syncing || !navigator.onLine) return;
      this.syncing = true;
      const { synced } = await trySyncOfflineQueue();
      this.syncing = false;
      this.refreshPendingCount();
      if (synced > 0) {
        this.flash(synced + " data offline berhasil disinkron.");
        await Promise.all([this.fetchProduction(), this.fetchDowntime(), this.fetchNonProduksi()]);
      }
    },

    // ================= STASIUN (multi-line Tandem/PC200t) =================
    stationList() {
      const cfg = this.stationConfig;
      if (cfg.mode === "fixed") return cfg.stations.map((id) => ({ id, label: id }));
      if (cfg.mode === "variant") {
        if (!this.tandemVariant) return [];
        return cfg.variants[this.tandemVariant].map((id) => ({ id, label: id }));
      }
      return [{ id: "_single", label: null }];
    },
    dbStasiun(stationId) {
      return stationId === "_single" ? null : stationId;
    },
    freshProductionForm() {
      const base = { part_number: "", qty: "", ng: "", kategori_ng: "", break_menit: "" };
      this.extraFields.forEach((f) => (base[f.key] = ""));
      return base;
    },
    freshLine() {
      return {
        state: "idle", // 'idle' | 'running' | 'stopped'
        start: null,
        end: null,
        editingId: null,
        form: this.freshProductionForm(),
        routingType: null,
        routingNumbers: [],
        pendingClassification: false,
        classification: { kategori: "DANDORI", part_dari: "", part_ke: "", keterangan: "", gapStart: null, gapEnd: null },
      };
    },
    ensureLines() {
      this.stationList().forEach((st) => {
        if (!this.lines[st.id]) this.lines[st.id] = this.freshLine();
      });
    },
    setTandemVariant(v) {
      this.tandemVariant = v;
      this.ensureLines();
    },
    routingRange() {
      return Array.from({ length: this.routingMax }, (_, i) => i + 1);
    },
    toggleRoutingNumber(stationId, n) {
      const line = this.lines[stationId];
      const i = line.routingNumbers.indexOf(n);
      if (i === -1) line.routingNumbers.push(n); else line.routingNumbers.splice(i, 1);
    },
    setRoutingType(stationId, type) {
      const line = this.lines[stationId];
      line.routingType = type;
      line.routingNumbers = [];
    },

    // Cari entri produksi terakhir yang SUDAH selesai di stasiun ini,
    // buat tahu apakah ada jeda yang perlu diklasifikasi.
    lastStopForStation(stationId) {
      const want = this.dbStasiun(stationId);
      const rows = this.productionRows.filter(
        (r) => (r.stasiun || null) === want && r.waktu_akhir && !r._pending
      );
      if (rows.length === 0) return null;
      rows.sort((a, b) => new Date(b.waktu_akhir) - new Date(a.waktu_akhir));
      return rows[0];
    },

    // Diklik dari tombol "▶ Mulai Produksi"
    clickMulaiProduksi(stationId) {
      const line = this.lines[stationId];
      const last = this.lastStopForStation(stationId);
      if (last) {
        line.classification = {
          kategori: "DANDORI",
          part_dari: last.part_number || "",
          part_ke: "",
          keterangan: "",
          gapStart: last.waktu_akhir,
          gapEnd: nowIso(),
        };
        line.pendingClassification = true;
      } else {
        this.reallyStartProduction(stationId);
      }
    },
    cancelClassification(stationId) {
      this.lines[stationId].pendingClassification = false;
    },
    async confirmClassificationAndStart(stationId) {
      const line = this.lines[stationId];
      const c = line.classification;
      if (!c.kategori) { this.flash("Pilih kategori non-produksi dulu.", true); return; }

      const payload = {
        mesin: machineKey,
        waktu_awal: c.gapStart,
        waktu_akhir: c.gapEnd,
        kategori: c.kategori,
        stasiun: this.dbStasiun(stationId),
        part_dari: c.part_dari || null,
        part_ke: c.part_ke || null,
        keterangan: c.keterangan || null,
        created_by: this.session.user.id,
      };

      try {
        if (!navigator.onLine) throw new Error("offline");
        const { error } = await supabaseClient.from("dandori_log").insert(payload);
        if (error) throw error;
        await this.fetchNonProduksi();
      } catch (err) {
        if (isNetworkError(err)) {
          enqueueOffline("dandori_log", payload);
          this.refreshPendingCount();
          this.nonProduksiRows.unshift({ ...payload, id: "pending_" + Date.now(), _pending: true });
          this.flash("Tidak ada jaringan — catatan non-produksi disimpan di HP dulu.");
        } else {
          this.flash("Gagal simpan data non-produksi: " + (err.message || err), true);
          return; // jangan mulai produksi kalau gagal simpan karena error asli (bukan offline)
        }
      }

      if (c.part_ke) line.form.part_number = c.part_ke;
      line.pendingClassification = false;
      this.reallyStartProduction(stationId);
    },

    reallyStartProduction(stationId) {
      const line = this.lines[stationId];
      line.state = "running";
      line.start = nowIso();
      line.end = null;
    },
    stopProduction(stationId) {
      const line = this.lines[stationId];
      line.state = "stopped";
      line.end = nowIso();
    },
    cancelProductionTimer(stationId) {
      this.lines[stationId] = this.freshLine();
    },

    async fetchProduction() {
      const { data, error } = await supabaseClient
        .from("production_log")
        .select("*")
        .eq("mesin", machineKey)
        .order("waktu_awal", { ascending: false })
        .limit(300);
      if (error) { this.flash("Gagal memuat data produksi: " + error.message, true); return; }
      this.productionRows = data;
    },

    editProduction(row) {
      const stationId = row.stasiun || "_single";
      // kalau Tandem dan baris ini dari varian yang beda dari yang lagi
      // dipilih, otomatis pindah varian biar kartunya kelihatan
      if (this.stationConfig.mode === "variant" && row.stasiun) {
        if (this.stationConfig.variants.lama.includes(row.stasiun)) this.setTandemVariant("lama");
        else if (this.stationConfig.variants.baru.includes(row.stasiun)) this.setTandemVariant("baru");
      }
      if (!this.lines[stationId]) this.lines[stationId] = this.freshLine();
      const line = this.lines[stationId];
      line.editingId = row.id;
      line.state = "stopped";
      line.start = row.waktu_awal;
      line.end = row.waktu_akhir;
      line.form = {
        part_number: row.part_number || "", qty: row.qty ?? "", ng: row.ng ?? "",
        kategori_ng: row.kategori_ng || "", break_menit: row.break_menit ?? "",
      };
      this.extraFields.forEach((f) => (line.form[f.key] = row.extra?.[f.key] ?? ""));
      line.routingType = row.extra?.routing_type || null;
      line.routingNumbers = row.extra?.routing_numbers || [];
      line.pendingClassification = false;
      this.tab = "produksi";
      window.scrollTo({ top: 0, behavior: "smooth" });
    },

    async submitProduction(stationId) {
      const line = this.lines[stationId];
      const f = line.form;
      if (!line.start || !line.end) {
        this.flash("Klik Mulai lalu Selesai dulu untuk catat waktunya.", true);
        return;
      }
      const extra = {};
      this.extraFields.forEach((field) => { extra[field.key] = f[field.key] === "" ? null : f[field.key]; });
      if (this.routingMax > 0) {
        extra.routing_type = line.routingType;
        extra.routing_numbers = line.routingNumbers;
      }

      const payload = {
        mesin: machineKey,
        stasiun: this.dbStasiun(stationId),
        waktu_awal: line.start,
        waktu_akhir: line.end,
        part_number: f.part_number || null,
        qty: f.qty === "" ? null : Number(f.qty),
        ng: f.ng === "" ? null : Number(f.ng),
        kategori_ng: f.kategori_ng || null,
        break_menit: f.break_menit === "" ? null : Number(f.break_menit),
        extra,
      };

      if (f.part_number) this.learnPartNumber(f.part_number);

      if (line.editingId) {
        try {
          const { error } = await supabaseClient.from("production_log").update(payload).eq("id", line.editingId);
          if (error) throw error;
          this.flash("Data produksi diperbarui.");
          this.lines[stationId] = this.freshLine();
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
        this.lines[stationId] = this.freshLine();
        await this.fetchProduction();
      } catch (err) {
        if (isNetworkError(err)) {
          enqueueOffline("production_log", payload);
          this.refreshPendingCount();
          this.productionRows.unshift({ ...payload, id: "pending_" + Date.now(), _pending: true });
          this.flash("Tidak ada jaringan — data disimpan di HP, akan disinkron otomatis nanti.");
          this.lines[stationId] = this.freshLine();
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

    // ================= DOWNTIME (tetap 1 per halaman) =================
    resetDowntimeForm() {
      this.downtimeForm = { kategori: "", problem: "", penyebab: "", countermeasure: "" };
      this.editingDowntimeId = null;
      this.dtState = "idle";
      this.dtStart = null;
      this.dtEnd = null;
    },
    startDowntime() { this.dtState = "running"; this.dtStart = nowIso(); },
    stopDowntime() { this.dtState = "stopped"; this.dtEnd = nowIso(); },
    cancelDowntimeTimer() { this.resetDowntimeForm(); },

    async fetchDowntime() {
      const { data, error } = await supabaseClient
        .from("downtime_log").select("*").eq("mesin", machineKey)
        .order("waktu_awal", { ascending: false }).limit(200);
      if (error) { this.flash("Gagal memuat data downtime: " + error.message, true); return; }
      this.downtimeRows = data;
    },

    editDowntime(row) {
      this.editingDowntimeId = row.id;
      this.dtState = "stopped";
      this.dtStart = row.waktu_awal;
      this.dtEnd = row.waktu_akhir;
      this.downtimeForm = {
        kategori: row.kategori || "", problem: row.problem || "",
        penyebab: row.penyebab || "", countermeasure: row.countermeasure || "",
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
        mesin: machineKey, waktu_awal: this.dtStart, waktu_akhir: this.dtEnd,
        kategori: f.kategori || null, problem: f.problem || null,
        penyebab: f.penyebab || null, countermeasure: f.countermeasure || null,
      };
      if (f.problem) this.learnProblem(f.problem);

      if (this.editingDowntimeId) {
        try {
          const { error } = await supabaseClient.from("downtime_log").update(payload).eq("id", this.editingDowntimeId);
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

    // ================= NON-PRODUKSI (Dandori/Watari/Stop Line/Other) =================
    // Dibuat otomatis dari alur "Mulai Produksi". Di sini cuma lihat &
    // koreksi (edit/hapus) kalau kategorinya salah atau perlu diperbaiki.
    async fetchNonProduksi() {
      const { data, error } = await supabaseClient
        .from("dandori_log").select("*").eq("mesin", machineKey)
        .order("waktu_awal", { ascending: false }).limit(200);
      if (error) { this.flash("Gagal memuat data non-produksi: " + error.message, true); return; }
      this.nonProduksiRows = data;
    },
    editNonProduksi(row) {
      this.editingNonProduksiId = row.id;
      this.nonProduksiEditForm = {
        waktu_awal: toLocalInput(row.waktu_awal),
        waktu_akhir: toLocalInput(row.waktu_akhir),
        kategori: row.kategori || "DANDORI",
        stasiun: row.stasiun || "",
        part_dari: row.part_dari || "",
        part_ke: row.part_ke || "",
        keterangan: row.keterangan || "",
      };
    },
    cancelEditNonProduksi() {
      this.editingNonProduksiId = null;
      this.nonProduksiEditForm = {};
    },
    async saveNonProduksiEdit() {
      const f = this.nonProduksiEditForm;
      if (!f.waktu_awal || !f.waktu_akhir) { this.flash("Waktu awal/akhir wajib diisi.", true); return; }
      const payload = {
        waktu_awal: new Date(f.waktu_awal).toISOString(),
        waktu_akhir: new Date(f.waktu_akhir).toISOString(),
        kategori: f.kategori || "OTHER",
        stasiun: f.stasiun || null,
        part_dari: f.part_dari || null,
        part_ke: f.part_ke || null,
        keterangan: f.keterangan || null,
      };
      const { error } = await supabaseClient.from("dandori_log").update(payload).eq("id", this.editingNonProduksiId);
      if (error) { this.flash("Gagal menyimpan (butuh koneksi): " + error.message, true); return; }
      this.flash("Data non-produksi diperbarui.");
      this.cancelEditNonProduksi();
      await this.fetchNonProduksi();
    },
    async deleteNonProduksi(id) {
      if (String(id).startsWith("pending_")) {
        this.flash("Data ini masih menunggu sinkron, tunggu online dulu sebelum menghapus.", true);
        return;
      }
      if (!confirm("Hapus catatan non-produksi ini?")) return;
      const { error } = await supabaseClient.from("dandori_log").delete().eq("id", id);
      if (error) { this.flash("Gagal menghapus: " + error.message, true); return; }
      this.flash("Data non-produksi dihapus.");
      await this.fetchNonProduksi();
    },
    kategoriNonProduksiLabel(k) {
      return { DANDORI: "Dandori", WATARI: "Watari", STOP_LINE: "Stop Line Terencana", OTHER: "Other" }[k] || k;
    },

    // ================= MASTER DATA (Part Number & Problem) =================
    async fetchPartNumbers() {
      const { data, error } = await supabaseClient
        .from("part_numbers").select("id, value, next_processes").eq("mesin", machineKey).order("value");
      if (error) {
        this.flash("Gagal memuat daftar Part Number: " + error.message, true);
        return;
      }
      this.partNumberList = data.map((r) => ({
        ...r, editing: false, draft: r.value,
        draftNextProcesses: (r.next_processes || []).map((p) => ({ ...p })),
      }));
    },
    async fetchProblems() {
      const { data, error } = await supabaseClient
        .from("downtime_problems").select("id, value").eq("mesin", machineKey).order("value");
      if (error) {
        this.flash("Gagal memuat daftar Problem: " + error.message, true);
        return;
      }
      this.problemList = data.map((r) => ({ ...r, editing: false, draft: r.value }));
    },
    async learnPartNumber(value) {
      if (!value) return;
      if (this.partNumberList.some((r) => r.value.toLowerCase() === value.toLowerCase())) return;
      const { data, error } = await supabaseClient.from("part_numbers").insert({ mesin: machineKey, value }).select().single();
      if (!error && data) {
        this.partNumberList.push({ ...data, editing: false, draft: data.value, draftNextProcesses: [] });
      }
    },
    async learnProblem(value) {
      if (!value) return;
      if (this.problemList.some((r) => r.value.toLowerCase() === value.toLowerCase())) return;
      const { data, error } = await supabaseClient.from("downtime_problems").insert({ mesin: machineKey, value }).select().single();
      if (!error && data) this.problemList.push({ ...data, editing: false, draft: data.value });
    },
    async addMasterPartNumber() {
      const v = (this.newPartNumberValue || "").trim();
      if (!v) return;
      const { data, error } = await supabaseClient.from("part_numbers").insert({ mesin: machineKey, value: v }).select().single();
      if (error) { this.flash("Gagal tambah (mungkin sudah ada): " + error.message, true); return; }
      this.partNumberList.push({ ...data, editing: false, draft: data.value, draftNextProcesses: [] });
      this.partNumberList.sort((a, b) => a.value.localeCompare(b.value));
      this.newPartNumberValue = "";
      this.flash("Part number ditambahkan.");
    },
    startEditPartNumber(item) {
      item.draft = item.value;
      item.draftNextProcesses = (item.next_processes || []).map((p) => ({ ...p }));
      item.draftNextProcesses.forEach((p) => { if (p.line) this.ensurePartNumbersForLine(p.line); });
      item.editing = true;
    },
    cancelEditPartNumber(item) {
      item.draft = item.value;
      item.draftNextProcesses = (item.next_processes || []).map((p) => ({ ...p }));
      item.editing = false;
    },
    addNextProcessRow(item) {
      item.draftNextProcesses.push({ line: "", part_number: "" });
    },
    removeNextProcessRow(item, idx) {
      item.draftNextProcesses.splice(idx, 1);
    },
    async saveMasterPartNumber(item) {
      const v = (item.draft || "").trim();
      if (!v) { this.flash("Part number tidak boleh kosong.", true); return; }
      const cleanProcesses = item.draftNextProcesses
        .filter((p) => p.line && p.part_number)
        .map((p) => ({ line: p.line, part_number: p.part_number }));
      const payload = { value: v, next_processes: cleanProcesses };
      const { data, error } = await supabaseClient.from("part_numbers").update(payload).eq("id", item.id).select();
      if (error) { this.flash("Gagal simpan (mungkin sudah ada yang sama): " + error.message, true); return; }
      if (!data || data.length === 0) {
        this.flash("Gagal simpan — perubahan tidak masuk ke database (kemungkinan izin akses). Coba lagi atau kabari admin.", true);
        return;
      }
      item.value = v;
      item.next_processes = cleanProcesses;
      item.draftNextProcesses = cleanProcesses.map((p) => ({ ...p }));
      item.editing = false;
      this.flash("Part number diperbarui.");
    },

    // Cache daftar part number per line, dipakai dropdown "Proses Selanjutnya"
    async ensurePartNumbersForLine(lineKey) {
      if (!lineKey || this.partNumbersByLine[lineKey]) return;
      const { data, error } = await supabaseClient
        .from("part_numbers").select("value").eq("mesin", lineKey).order("value");
      if (!error && data) this.partNumbersByLine[lineKey] = data.map((r) => r.value);
    },
    machineLabel(key) {
      return this.machineOptions.find((m) => m.key === key)?.label || key;
    },
    nextProcessesLabel(item) {
      if (!item.next_processes || item.next_processes.length === 0) return "";
      return item.next_processes
        .map((p) => this.machineLabel(p.line) + (p.part_number ? " — " + p.part_number : ""))
        .join("  •  ");
    },
    async deleteMasterPartNumber(id) {
      if (!confirm("Hapus part number ini dari daftar pilihan?")) return;
      const { error } = await supabaseClient.from("part_numbers").delete().eq("id", id);
      if (error) { this.flash("Gagal hapus: " + error.message, true); return; }
      this.partNumberList = this.partNumberList.filter((r) => r.id !== id);
      this.flash("Part number dihapus dari daftar.");
    },
    async addMasterProblem() {
      const v = (this.newProblemValue || "").trim();
      if (!v) return;
      const { data, error } = await supabaseClient.from("downtime_problems").insert({ mesin: machineKey, value: v }).select().single();
      if (error) { this.flash("Gagal tambah (mungkin sudah ada): " + error.message, true); return; }
      this.problemList.push({ ...data, editing: false, draft: data.value });
      this.problemList.sort((a, b) => a.value.localeCompare(b.value));
      this.newProblemValue = "";
      this.flash("Problem ditambahkan.");
    },
    startEditProblem(item) { item.draft = item.value; item.editing = true; },
    cancelEditProblem(item) { item.draft = item.value; item.editing = false; },
    async saveMasterProblem(item) {
      const v = (item.draft || "").trim();
      if (!v) { this.flash("Problem tidak boleh kosong.", true); return; }
      const { data, error } = await supabaseClient.from("downtime_problems").update({ value: v }).eq("id", item.id).select();
      if (error) { this.flash("Gagal simpan (mungkin sudah ada yang sama): " + error.message, true); return; }
      if (!data || data.length === 0) {
        this.flash("Gagal simpan — perubahan tidak masuk ke database (kemungkinan izin akses). Coba lagi atau kabari admin.", true);
        return;
      }
      item.value = v; item.editing = false;
      this.flash("Problem diperbarui.");
    },
    async deleteMasterProblem(id) {
      if (!confirm("Hapus problem ini dari daftar pilihan?")) return;
      const { error } = await supabaseClient.from("downtime_problems").delete().eq("id", id);
      if (error) { this.flash("Gagal hapus: " + error.message, true); return; }
      this.problemList = this.problemList.filter((r) => r.id !== id);
      this.flash("Problem dihapus dari daftar.");
    },

    // ================= Persistensi timer & form (localStorage) =================
    restoreState() {
      const saved = loadTimerStateFor(machineKey);
      if (!saved) return false;
      if (saved.tandemVariant) this.tandemVariant = saved.tandemVariant;
      this.ensureLines();
      if (saved.lines) {
        Object.entries(saved.lines).forEach(([id, savedLine]) => {
          if (!savedLine || savedLine.state === "idle") return;
          if (!this.lines[id]) this.lines[id] = this.freshLine();
          Object.assign(this.lines[id], savedLine);
        });
      }
      let restoredDt = false;
      if (saved.dtState && saved.dtState !== "idle") {
        this.dtState = saved.dtState;
        this.dtStart = saved.dtStart;
        this.dtEnd = saved.dtEnd;
        this.downtimeForm = saved.downtimeForm || this.downtimeForm;
        restoredDt = true;
      }
      return restoredDt;
    },
    watchAndAutosave() {
      const persist = () => {
        const state = { tandemVariant: this.tandemVariant, lines: {} };
        Object.entries(this.lines).forEach(([id, line]) => {
          if (line.editingId) return; // jangan timpa penyimpanan kalau lagi mode edit koreksi
          state.lines[id] = line;
        });
        if (!this.editingDowntimeId) {
          state.dtState = this.dtState; state.dtStart = this.dtStart; state.dtEnd = this.dtEnd;
          state.downtimeForm = this.downtimeForm;
        } else {
          const prev = loadTimerStateFor(machineKey) || {};
          state.dtState = prev.dtState; state.dtStart = prev.dtStart; state.dtEnd = prev.dtEnd;
          state.downtimeForm = prev.downtimeForm;
        }
        saveTimerStateFor(machineKey, state);
      };
      this.$watch("lines", persist);
      this.$watch("tandemVariant", persist);
      this.$watch("dtState", persist);
      this.$watch("dtStart", persist);
      this.$watch("dtEnd", persist);
      this.$watch("downtimeForm", persist);
    },

    // ================= util tampilan =================
    fmt(iso) {
      if (!iso) return "-";
      return new Date(iso).toLocaleString("id-ID", {
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
    // Jeda otomatis dari selesainya part sebelumnya (di stasiun yang SAMA)
    // ke mulainya part ini — cuma referensi, bukan pengganti catatan
    // Non-Produksi (yang sudah wajib diisi tiap mulai produksi lagi).
    gapDariSebelumnya(row) {
      if (!row.part_number || !row.waktu_awal) return null;
      const sameStation = (row.stasiun || null);
      const candidates = this.productionRows.filter(
        (r) => r.id !== row.id && (r.stasiun || null) === sameStation && r.waktu_akhir &&
          new Date(r.waktu_akhir) <= new Date(row.waktu_awal)
      );
      if (candidates.length === 0) return null;
      candidates.sort((a, b) => new Date(b.waktu_akhir) - new Date(a.waktu_akhir));
      const prev = candidates[0];
      if (!prev.part_number || prev.part_number === row.part_number) return null;
      const diffMin = Math.round((new Date(row.waktu_awal) - new Date(prev.waktu_akhir)) / 60000);
      return diffMin >= 0 ? diffMin : null;
    },

    logout,
  };
}
