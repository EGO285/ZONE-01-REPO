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
    res.end("EGO BOT is running\n");
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => {
    console.log(`Serveur HTTP en écoute sur le port ${PORT}`);
});

// =========================
// SAFE JSON HELPER
// =========================
function safeJSON(path, fallback = {}) {
    try {
        if (!fs.existsSync(path)) return fallback;
        return JSON.parse(fs.readFileSync(path));
    } catch (e) {
        return fallback;
    }
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
    // PAIRING CODE
    // =========================
    if (!sock.authState.creds.registered) {
        const phoneNumber = process.env.PHONE_NUMBER || "33665384876";

        setTimeout(async () => {
            try {
                const code = await sock.requestPairingCode(phoneNumber);

                console.log("====================================");
                console.log("      🎴 EGO BOT PAIRING CODE");
                console.log("====================================");
                console.log(code);
                console.log("====================================");
            } catch (e) {
                console.error("Pairing error:", e);
            }
        }, 4000);
    }

    sock.ev.on("creds.update", saveCreds);

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

            console.log("Connexion fermée. Reconnexion :", shouldReconnect);

            if (shouldReconnect) startBot();

        } else if (connection === "open") {
            console.log("✅ EGO BOT CONNECTÉ");
        }
    });

    // =========================
    // MESSAGES
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

        const from = m.key.remoteJid;

        // =========================
        // PLUGINS SYSTEM (FIX ARGUMENTS)
        // =========================
        fs.readdirSync("./plugins").forEach(file => {
            if (!file.endsWith(".js")) return;

            delete require.cache[require.resolve(`./plugins/${file}`)];
            const cmd = require(`./plugins/${file}`);

            if (!cmd.command) return;

            const command = cmd.command.toLowerCase();

            if (cleanText.startsWith(command)) {

                const args = cleanText.slice(command.length).trim();

                cmd.handler(sock, m, cleanText, args);
            }
        });

        // =========================
        // COMBATS SYSTEM
        // =========================
        const dbPath = "./data/combats.json";

        const db = safeJSON(dbPath, { active: {} });

        if (!db.active) db.active = {};

        if (db.active[from]) {
            if (!cleanText.startsWith("#")) {
                db.active[from].messages.push(cleanText);
                fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
            }
        }
    });
}

startBot();
