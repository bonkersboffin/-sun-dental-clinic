from flask import Flask, request, jsonify, render_template, redirect, url_for, session
from werkzeug.security import check_password_hash, generate_password_hash
import json, os, datetime

app = Flask(__name__)
app.secret_key = "dev_secret_key"

# Toggle persistence. When False the app uses an in-memory store and
# does not read or write the `patients.json` file. Set to True to
# restore file-backed persistence.
PERSIST_DATA = True
DATA_FILE = "patients.json"
CREDENTIALS_FILE = "credentials.json"

# In-memory stores used when PERSIST_DATA is False.
IN_MEMORY_DATA = {}
IN_MEMORY_CREDENTIALS = {}

def load_credentials():
    if not PERSIST_DATA:
        return IN_MEMORY_CREDENTIALS
    if not os.path.exists(CREDENTIALS_FILE):
        return {}
    with open(CREDENTIALS_FILE, "r") as f:
        return json.load(f)

def save_credentials(credentials):
    if not PERSIST_DATA:
        IN_MEMORY_CREDENTIALS.clear()
        IN_MEMORY_CREDENTIALS.update(credentials)
        return
    with open(CREDENTIALS_FILE, "w") as f:
        json.dump(credentials, f, indent=2)

def has_account(credentials):
    return bool(
        credentials.get("username")
        and (credentials.get("password_hash") or credentials.get("password"))
    )

def password_matches(credentials, password):
    password_hash = credentials.get("password_hash")
    if password_hash:
        return check_password_hash(password_hash, password)
    return password == credentials.get("password", "")

def load_data():
    if not PERSIST_DATA:
        return IN_MEMORY_DATA
    if not os.path.exists(DATA_FILE):
        return {}
    with open(DATA_FILE, "r") as f:
        return json.load(f)

def save_data(data):
    if not PERSIST_DATA:
        # Update in-memory store (mutate so callers keep reference semantics)
        IN_MEMORY_DATA.clear()
        IN_MEMORY_DATA.update(data)
        return
    with open(DATA_FILE, "w") as f:
        json.dump(data, f, indent=2)

@app.route("/")
def index():
    if not session.get("user"):
        return redirect(url_for("login"))
    return render_template("index.html")


@app.route("/login", methods=["GET", "POST"])
def login():
    credentials = load_credentials()
    if request.method == "POST":
        username = request.form.get("username", "").strip()
        password = request.form.get("password", "")
        next_url = request.args.get("next") or url_for("index")
        if not has_account(credentials):
            return render_template(
                "login.html",
                error="No account exists yet. Please create one first.",
            )
        if username == credentials.get("username") and password_matches(credentials, password):
            session["user"] = username
            return redirect(next_url)
        return render_template("login.html", error="Invalid credentials")

    return render_template(
        "login.html",
        info=("No account found. Create one below." if not has_account(credentials) else None),
    )


@app.route("/register", methods=["GET", "POST"])
def register():
    credentials = load_credentials()
    if has_account(credentials):
        return render_template(
            "login.html",
            error="An account already exists. Please sign in.",
        )

    if request.method == "POST":
        username = request.form.get("username", "").strip()
        password = request.form.get("password", "")
        if not username or not password:
            return render_template(
                "register.html",
                error="Username and password are required.",
            )
        save_credentials({
            "username": username,
            "password_hash": generate_password_hash(password),
        })
        return render_template(
            "login.html",
            success="Account created successfully. Please sign in.",
        )

    return render_template("register.html")


@app.route("/logout")
def logout():
    session.pop("user", None)
    return redirect(url_for("login"))

@app.route("/api/patients/search")
def search_patients():
    query = request.args.get("q", "").strip().lower()
    if not query:
        return jsonify([])
    data = load_data()
    results = []
    for pid, p in data.items():
        name_match = query in p["name"].lower()
        phone_match = query in p.get("phone", "").lower()
        if name_match or phone_match:
            results.append({"id": pid, "name": p["name"], "phone": p.get("phone", "")})
    return jsonify(results)

@app.route("/api/patients/<patient_id>")
def get_patient(patient_id):
    data = load_data()
    if patient_id not in data:
        return jsonify({"error": "Not found"}), 404
    return jsonify(data[patient_id])

@app.route("/api/patients", methods=["POST"])
def add_patient():
    body = request.json
    name = body.get("name", "").strip()
    if not name:
        return jsonify({"error": "Name required"}), 400
    data = load_data()
    # Check duplicate
    pid = name.lower().replace(" ", "_") + "_" + str(len(data)+1)
    data[pid] = {
        "id": pid,
        "name": name,
        "age": body.get("age", ""),
        "phone": body.get("phone", ""),
        "email": body.get("email", ""),
        "blood_group": body.get("blood_group", ""),
        "allergies": body.get("allergies", ""),
        "visits": []
    }
    save_data(data)
    return jsonify({"success": True, "id": pid, "name": name})

@app.route("/api/patients/<patient_id>/visit", methods=["POST"])
def add_visit(patient_id):
    body = request.json
    data = load_data()
    if patient_id not in data:
        return jsonify({"error": "Not found"}), 404
    visit = {
        "date": body.get("date", datetime.date.today().isoformat()),
        "problem": body.get("problem", ""),
        "treatment": body.get("treatment", ""),
        "notes": body.get("notes", ""),
        "next_appointment": body.get("next_appointment", ""),
        "cost": body.get("cost", "")
    }
    data[patient_id]["visits"].append(visit)
    save_data(data)
    return jsonify({"success": True})

@app.route("/api/patients/<patient_id>", methods=["DELETE"])
def delete_patient(patient_id):
    data = load_data()
    if patient_id not in data:
        return jsonify({"error": "Not found"}), 404
    patient = data.pop(patient_id)
    save_data(data)
    return jsonify({"success": True, "id": patient_id, "name": patient.get("name", "")})

@app.route("/api/patients/<patient_id>", methods=["PUT"])
def update_patient(patient_id):
    body = request.json
    data = load_data()
    if patient_id not in data:
        return jsonify({"error": "Not found"}), 404
    for field in ["age", "phone", "email", "blood_group", "allergies"]:
        if field in body:
            data[patient_id][field] = body[field]
    save_data(data)
    return jsonify({"success": True})

if __name__ == "__main__":
    app.run(debug=True, port=5000)
