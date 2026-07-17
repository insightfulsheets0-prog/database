// =========================================================
// Komponen Alpine.js generik untuk halaman per-mesin.
// Dipakai oleh semua file di /machines/*.html dengan config
// berbeda (nama mesin + kolom tambahan/extra).
// =========================================================
function machinePage(machineKey, machineLabel, extraFields) {
  return {
    // ---- state umum ----
    session: null,
    profile: null,
    tab: "produksi", // 'produksi' | 'downtime'
    loading: true,
    errorMsg: "",
    successMsg: "",
    extraFields, // [{key,label,type}]
    mobileNavOpen: false,

    // ---- data ----
    productionRows: [],
    downtimeRows: [],

    // ---- form produksi ----
    editingProductionId: null,
    productionForm: {},

    // ---- form downtime ----
    editingDowntimeId: null,
    downtimeForm: {},

    async init() {
      this.session = await requireAuth();
      if (!this.session) return;

      const { data: profile } = await supabaseClient
        .from("profiles")
        .select("*")
        .eq("id", this.session.user.id)
        .single();
      this.profile = profile;

      this.resetProductionForm();
      this.resetDowntimeForm();
      await Promise.all([this.fetchProduction(), this.fetchDowntime()]);
      this.loading = false;
    },

    flash(msg, isError = false) {
      if (isError) { this.errorMsg = msg; this.successMsg = ""; }
      else { this.successMsg = msg; this.errorMsg = ""; }
      setTimeout(() => { this.errorMsg = ""; this.successMsg = ""; }, 3500);
    },

    // ================= PRODUKSI =================
    resetProductionForm() {
      const base = {
        waktu_awal: "",
        waktu_akhir: "",
        part_number: "",
        qty: "",
        ng: "",
        kategori_ng: "",
        break_menit: "",
      };
      this.extraFields.forEach(f => base[f.key] = "");
      this.productionForm = base;
      this.editingProductionId = null;
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
      this.productionForm = {
        waktu_awal: toLocalInput(row.waktu_awal),
        waktu_akhir: toLocalInput(row.waktu_akhir),
        part_number: row.part_number || "",
        qty: row.qty ?? "",
        ng: row.ng ?? "",
        kategori_ng: row.kategori_ng || "",
        break_menit: row.break_menit ?? "",
      };
      this.extraFields.forEach(f => {
        this.productionForm[f.key] = row.extra?.[f.key] ?? "";
      });
      this.tab = "produksi";
      window.scrollTo({ top: 0, behavior: "smooth" });
    },

    async submitProduction() {
      const f = this.productionForm;
      if (!f.waktu_awal || !f.waktu_akhir) {
        this.flash("Waktu awal dan waktu akhir wajib diisi.", true);
        return;
      }
      const extra = {};
      this.extraFields.forEach(field => {
        extra[field.key] = f[field.key] === "" ? null : f[field.key];
      });

      const payload = {
        mesin: machineKey,
        waktu_awal: new Date(f.waktu_awal).toISOString(),
        waktu_akhir: new Date(f.waktu_akhir).toISOString(),
        part_number: f.part_number || null,
        qty: f.qty === "" ? null : Number(f.qty),
        ng: f.ng === "" ? null : Number(f.ng),
        kategori_ng: f.kategori_ng || null,
        break_menit: f.break_menit === "" ? null : Number(f.break_menit),
        extra,
      };

      let error;
      if (this.editingProductionId) {
        ({ error } = await supabaseClient
          .from("production_log")
          .update(payload)
          .eq("id", this.editingProductionId));
      } else {
        payload.created_by = this.session.user.id;
        ({ error } = await supabaseClient.from("production_log").insert(payload));
      }

      if (error) { this.flash("Gagal menyimpan: " + error.message, true); return; }
      this.flash(this.editingProductionId ? "Data produksi diperbarui." : "Data produksi ditambahkan.");
      this.resetProductionForm();
      await this.fetchProduction();
    },

    async deleteProduction(id) {
      if (!confirm("Hapus baris data produksi ini?")) return;
      const { error } = await supabaseClient.from("production_log").delete().eq("id", id);
      if (error) { this.flash("Gagal menghapus: " + error.message, true); return; }
      this.flash("Data produksi dihapus.");
      await this.fetchProduction();
    },

    // ================= DOWNTIME =================
    resetDowntimeForm() {
      this.downtimeForm = {
        waktu_awal: "",
        waktu_akhir: "",
        kategori: "",
        problem: "",
        penyebab: "",
        countermeasure: "",
      };
      this.editingDowntimeId = null;
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
      this.downtimeForm = {
        waktu_awal: toLocalInput(row.waktu_awal),
        waktu_akhir: toLocalInput(row.waktu_akhir),
        kategori: row.kategori || "",
        problem: row.problem || "",
        penyebab: row.penyebab || "",
        countermeasure: row.countermeasure || "",
      };
      this.tab = "downtime";
      window.scrollTo({ top: 0, behavior: "smooth" });
    },

    async submitDowntime() {
      const f = this.downtimeForm;
      if (!f.waktu_awal || !f.waktu_akhir) {
        this.flash("Waktu awal dan waktu akhir wajib diisi.", true);
        return;
      }
      const payload = {
        mesin: machineKey,
        waktu_awal: new Date(f.waktu_awal).toISOString(),
        waktu_akhir: new Date(f.waktu_akhir).toISOString(),
        kategori: f.kategori || null,
        problem: f.problem || null,
        penyebab: f.penyebab || null,
        countermeasure: f.countermeasure || null,
      };

      let error;
      if (this.editingDowntimeId) {
        ({ error } = await supabaseClient
          .from("downtime_log")
          .update(payload)
          .eq("id", this.editingDowntimeId));
      } else {
        payload.created_by = this.session.user.id;
        ({ error } = await supabaseClient.from("downtime_log").insert(payload));
      }

      if (error) { this.flash("Gagal menyimpan: " + error.message, true); return; }
      this.flash(this.editingDowntimeId ? "Data downtime diperbarui." : "Data downtime ditambahkan.");
      this.resetDowntimeForm();
      await this.fetchDowntime();
    },

    async deleteDowntime(id) {
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
        day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit"
      });
    },

    durasiMenit(awal, akhir) {
      if (!awal || !akhir) return "-";
      const diff = (new Date(akhir) - new Date(awal)) / 60000;
      return diff >= 0 ? diff + " mnt" : "-";
    },

    logout,
  };
}

// input[type=datetime-local] butuh format "YYYY-MM-DDTHH:mm" versi lokal
function toLocalInput(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
