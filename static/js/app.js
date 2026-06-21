// ── State ──────────────────────────────────────
let currentPatientId = null;
let searchTimer = null;

// ── Init ───────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  const now = new Date();
  document.getElementById("todayDate").textContent = now.toLocaleDateString("en-IN", {
    weekday: "short", day: "numeric", month: "long", year: "numeric"
  });

  // Set today's date in visit form
  const today = now.toISOString().split("T")[0];
  document.getElementById("visitDate").value = today;

  // Close dropdown on outside click
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".search-wrap")) {
      document.getElementById("searchDropdown").innerHTML = "";
    }
  });
});

// ── Panel Switch ────────────────────────────────
function showPanel(name, btn) {
  document.querySelectorAll(".panel").forEach(p => p.classList.remove("active"));
  document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
  document.getElementById("panel-" + name).classList.add("active");
  btn.classList.add("active");
}

// ── Search ──────────────────────────────────────
function onSearch() {
  clearTimeout(searchTimer);
  const q = document.getElementById("searchInput").value.trim();
  if (!q) {
    document.getElementById("searchDropdown").innerHTML = "";
    return;
  }
  searchTimer = setTimeout(() => fetchSearch(q), 200);
}

async function fetchSearch(q) {
  const res = await fetch(`/api/patients/search?q=${encodeURIComponent(q)}`);
  const patients = await res.json();
  const dd = document.getElementById("searchDropdown");
  if (!patients.length) {
    dd.innerHTML = `<div class="dropdown-item" style="color:var(--text-light);justify-content:center;padding:16px;">No patients found</div>`;
    return;
  }
  dd.innerHTML = patients.map(p => `
    <div class="dropdown-item" onclick="loadPatient('${p.id}')">
      <div class="d-avatar">${initials(p.name)}</div>
      <div>
        <div class="d-name">${p.name}</div>
        <div class="d-phone">${p.phone || "No phone"}</div>
      </div>
    </div>
  `).join("");
}

async function loadPatient(id) {
  currentPatientId = id;
  document.getElementById("searchDropdown").innerHTML = "";

  const res = await fetch(`/api/patients/${id}`);
  const p = await res.json();

  document.getElementById("searchInput").value = p.name;
  document.getElementById("patientAvatar").textContent = initials(p.name);
  document.getElementById("cardName").textContent = p.name;
  document.getElementById("cardAge").textContent = p.age ? `Age ${p.age}` : "";
  document.getElementById("cardBlood").textContent = p.blood_group || "";
  document.getElementById("cardPhone").textContent = p.phone || "";

  const allergyEl = document.getElementById("cardAllergies");
  if (p.allergies && p.allergies.toLowerCase() !== "none") {
    allergyEl.textContent = "Allergies: " + p.allergies;
  } else {
    allergyEl.textContent = "";
  }

  renderVisits(p.visits || []);

  document.getElementById("patientCard").classList.remove("hidden");
  document.getElementById("emptyState").classList.add("hidden");
}

function renderVisits(visits) {
  const tl = document.getElementById("visitTimeline");
  const noV = document.getElementById("noVisits");

  if (!visits.length) {
    tl.innerHTML = "";
    noV.classList.remove("hidden");
    return;
  }
  noV.classList.add("hidden");

  // Sort newest first
  const sorted = [...visits].sort((a, b) => new Date(b.date) - new Date(a.date));

  tl.innerHTML = sorted.map((v, i) => `
    <div class="visit-entry">
      <div class="visit-dot">
        <svg viewBox="0 0 20 20" fill="none">
          <path d="M10 3C7 3 4.5 5.5 4.5 8.5c0 2 .8 4 2 6C7.5 16 9 19 10 19s2.5-3 3.5-4.5c1.2-2 2-4 2-6C15.5 5.5 13 3 10 3z" fill="white" opacity=".9"/>
        </svg>
      </div>
      <div class="visit-body">
        <div class="visit-date">${formatDate(v.date)}${i === 0 ? ' <span style="color:var(--red);font-weight:600;margin-left:6px;">Most Recent</span>' : ''}</div>
        <div class="visit-problem">${v.problem || "&mdash;"}</div>
        ${v.treatment ? `<div class="visit-treatment">Treatment: ${v.treatment}</div>` : ""}
        ${v.notes ? `<div class="visit-notes">${v.notes}</div>` : ""}
        <div class="visit-meta">
          ${v.next_appointment ? `<span class="visit-badge">Next: ${formatDate(v.next_appointment)}</span>` : ""}
          ${v.cost ? `<span class="visit-badge cost">&#8377;${Number(v.cost).toLocaleString("en-IN")}</span>` : ""}
        </div>
      </div>
    </div>
  `).join("");
}

// ── Visit Modal ─────────────────────────────────
function openVisitModal() {
  if (!currentPatientId) return;
  document.getElementById("visitModal").classList.remove("hidden");
}
function closeVisitModal() {
  document.getElementById("visitModal").classList.add("hidden");
  // Reset form
  ["visitProblem","visitTreatment","visitNotes","visitNext","visitCost"].forEach(id => {
    document.getElementById(id).value = "";
  });
}

async function saveVisit() {
  const problem = document.getElementById("visitProblem").value.trim();
  if (!problem) { showToast("Please enter the problem/complaint"); return; }

  const payload = {
    date:             document.getElementById("visitDate").value,
    problem,
    treatment:        document.getElementById("visitTreatment").value.trim(),
    notes:            document.getElementById("visitNotes").value.trim(),
    next_appointment: document.getElementById("visitNext").value,
    cost:             document.getElementById("visitCost").value
  };

  const res = await fetch(`/api/patients/${currentPatientId}/visit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (data.success) {
    closeVisitModal();
    showToast("Visit recorded successfully!");
    loadPatient(currentPatientId);
  }
}

// ── Add Patient ─────────────────────────────────
async function removePatient() {
  if (!currentPatientId) return;

  const name = document.getElementById("cardName").textContent || "this patient";
  const confirmed = window.confirm(`Remove ${name}? This will permanently delete their record and visit history.`);
  if (!confirmed) return;

  const res = await fetch(`/api/patients/${currentPatientId}`, { method: "DELETE" });
  const data = await res.json();

  if (!data.success) {
    showToast(data.error || "Could not remove patient");
    return;
  }

  currentPatientId = null;
  document.getElementById("searchInput").value = "";
  document.getElementById("searchDropdown").innerHTML = "";
  document.getElementById("patientCard").classList.add("hidden");
  document.getElementById("emptyState").classList.remove("hidden");
  document.getElementById("visitTimeline").innerHTML = "";
  document.getElementById("noVisits").classList.add("hidden");
  showToast(`Patient "${data.name || name}" removed.`);
}

async function addPatient() {
  const name = document.getElementById("newName").value.trim();
  if (!name) { showFormMsg("Name is required", "error"); return; }

  const payload = {
    name,
    age:         document.getElementById("newAge").value,
    blood_group: document.getElementById("newBlood").value,
    phone:       document.getElementById("newPhone").value.trim(),
    email:       document.getElementById("newEmail").value.trim(),
    allergies:   document.getElementById("newAllergies").value.trim()
  };

  const res = await fetch("/api/patients", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (data.success) {
    showFormMsg(`Patient "${data.name}" registered successfully!`, "success");
    ["newName","newAge","newPhone","newEmail","newAllergies"].forEach(id => document.getElementById(id).value = "");
    document.getElementById("newBlood").value = "";
  } else {
    showFormMsg(data.error || "Something went wrong", "error");
  }
}

// ── Helpers ─────────────────────────────────────
function initials(name) {
  return name.split(" ").map(w => w[0]).slice(0,2).join("").toUpperCase();
}

function formatDate(dateStr) {
  if (!dateStr) return "-";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function showToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.remove("hidden");
  setTimeout(() => t.classList.add("hidden"), 3000);
}

function showFormMsg(msg, type) {
  const m = document.getElementById("addMsg");
  m.textContent = msg;
  m.className = `form-msg ${type}`;
  m.classList.remove("hidden");
  setTimeout(() => m.classList.add("hidden"), 4000);
}
