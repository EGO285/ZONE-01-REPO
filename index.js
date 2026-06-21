const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason
} = require("@whiskeysockets/baileys");

const { Boom } = require("@hapi/boom");
const fs = require("fs");
const pino = require("pino");
const http = require("http");

// =========================
// SERVER
// =========================
const server = http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("EGO BOT RPG ONLINE\n");
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => {
    console.log(`Serveur OK sur ${PORT}`);
});

// =========================
// SAFE JSON
// =========================
function safeJSON(path, fallback = {}) {
    try {
        if (!fs.existsSync(path)) return fallback;
        const data = fs.readFileSync(path, "utf8");
        if (!data || data.trim() === "") return fallback;
        return JSON.parse(data);
    } catch (e) {
        console.log("⚠️ Reset JSON:", path);
        fs.writeFileSync(path, JSON.stringify(fallback, null, 2));
        return fallback;
    }
}

// =========================
// SAVE HELPER
// =========================
function save(path, data) {
    fs.writeFileSync(path, JSON.stringify(data, null, 2));
}

// =========================
// BOT START
// =========================
async function startBot() {

    const { state, saveCreds } = await useMultiFileAuthState("./session");

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: "silent" })
    });

    // =========================
    // CONNECTION
    // =========================
    sock.ev.on("connection.update", (update) => {

        const { connection, lastDisconnect } = update;

        if (connection === "close") {

            const shouldReconnect =
                (lastDisconnect?.error instanceof Boom)
                    ? lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut
                    : true;

            console.log("Connexion fermée :", shouldReconnect);

            if (shouldReconnect) startBot();

        } else if (connection === "open") {
            console.log("✅ EGO RPG BOT CONNECTÉ");
        }
    });

    sock.ev.on("creds.update", saveCreds);

    // =========================
    // MESSAGE SYSTEM
    // =========================
    sock.ev.on("messages.upsert", async ({ messages }) => {

        const m = messages[0];
        if (!m.message) return;

        const msg = m.message;

        const text =
            msg.conversation ||
            msg.extendedTextMessage?.text ||
            msg.imageMessage?.caption ||
            msg.videoMessage?.caption ||
            "";

        const cleanText = text.toLowerCase().trim();
        const args = cleanText.split(" ").slice(1).join(" ");

        const from = m.key.remoteJid;
        const user = (m.key.participant || m.key.remoteJid).split("@")[0];

        const dbPath = "./data/story/players.json";
        const db = safeJSON(dbPath, {});

        if (!db[user]) {
            db[user] = {
                active: false,
                state: "none",
                step: 0
            };
        }

        // =========================
        // 🧠 RPG STATE ENGINE
        // =========================

        // 📌 FICHE CREATION
        if (db[user].state === "creating") {

            if (db[user].step === 1) {
                db[user].nom = cleanText;
                db[user].step = 2;

                save(dbPath, db);

                return sock.sendMessage(from, { text: "📌 Prénom ?" });
            }

            if (db[user].step === 2) {
                db[user].prenom = cleanText;
                db[user].step = 3;

                save(dbPath, db);

                return sock.sendMessage(from, { text: "📌 Village ?" });
            }

            if (db[user].step === 3) {
                db[user].village = cleanText;
                db[user].state = "openworld";
                db[user].active = true;

                save(dbPath, db);

                return sock.sendMessage(from, {
                    text:
`🎉 FICHE TERMINÉE !

Bienvenue ${db[user].prenom}

🌍 Tape #explorer pour commencer`
                });
            }
        }

        // 📌 PNJ DIALOGUE
        if (db[user].state === "dialogue") {

            const pnj = db[user].pnj;

            const lines = {
                kakashi: [
                    "Hmm intéressant...",
                    "Tu progresses.",
                    "Continue ton entraînement."
                ],
                naruto: [
                    "Je deviendrai Hokage !",
                    "On s'entraîne ensemble !",
                    "Dattebayo !!"
                ]
            };

            db[user].step++;

            save(dbPath, db);

            return sock.sendMessage(from, {
                text: lines[pnj]?.[db[user].step] || "..."
            });
        }

        // 📌 MISSION MULTI ETAPES
        if (db[user].state === "mission") {

            const mission = db[user].mission;

            db[user].step++;

            if (db[user].step >= mission.steps.length) {

                db[user].state = "openworld";
                db[user].exp += 50;
                db[user].ryo += 10000;

                save(dbPath, db);

                return sock.sendMessage(from, {
                    text:
`🏆 MISSION TERMINÉE !

+50 EXP
+10000 Ryo`
                });
            }

            save(dbPath, db);

            return sock.sendMessage(from, {
                text: mission.steps[db[user].step]
            });
        }

        // =========================
        // PLUGINS SYSTEM
        // =========================
        fs.readdirSync("./plugins").forEach(file => {

            if (!file.endsWith(".js")) return;

            delete require.cache[require.resolve(`./plugins/${file}`)];
            const cmd = require(`./plugins/${file}`);

            if (!cmd.command) return;

            if (cleanText.startsWith(cmd.command)) {

                const argsText = cleanText.slice(cmd.command.length).trim();

                cmd.handler(sock, m, cleanText, argsText, db);
            }
        });

        // =========================
        // SAVE AUTO
        // =========================
        save(dbPath, db);
    });
}

startBot();
