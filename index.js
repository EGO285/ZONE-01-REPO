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
// SERVER (Render / Heroku)
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

        // 🔥 IMPORTANT FIX PARSING
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
        // PLUGINS SYSTEM
        // =========================
        fs.readdirSync("./plugins").forEach(file => {
            if (file.endsWith(".js")) {
                delete require.cache[require.resolve(`./plugins/${file}`)];
                const cmd = require(`./plugins/${file}`);

                if (cleanText.startsWith(cmd.command)) {
                    cmd.handler(sock, m, cleanText);
                }
            }
        });

        // =========================
        // STOCKAGE COMBATS
        // =========================
        const dbPath = "./data/combats.json";

        if (!fs.existsSync(dbPath)) {
            fs.writeFileSync(dbPath, JSON.stringify({ active: {} }, null, 2));
        }

        const db = JSON.parse(fs.readFileSync(dbPath));

        if (db.active[from]) {
            if (!cleanText.startsWith("#")) {
                db.active[from].messages.push(cleanText);
                fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
            }
        }
    });
}

startBot();
