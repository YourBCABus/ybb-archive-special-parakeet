const rp = require("request-promise-native");
const firebase = require("firebase-admin");
const luxon = require("luxon");
const sqlite = require("sqlite3");
const fs = require("fs");
const path = require("path");
const util = require("util");

const config = JSON.parse(fs.readFileSync(path.join(__dirname, "config.json"), "utf8"));
const serviceAccount = JSON.parse(fs.readFileSync(path.join(__dirname, "service-account.json"), "utf8"));

firebase.initializeApp({
    credential: firebase.credential.cert(serviceAccount)
});

const db = new sqlite.Database(path.join(__dirname, "data.db"));

db.serialize(() => {
    db.run("CREATE TABLE IF NOT EXISTS messages_sent (date INTEGER NOT NULL, ok INTEGER NOT NULL, result TEXT);");
    db.run("CREATE INDEX IF NOT EXISTS messages_sent_date ON messages_sent (date);")
});

let running = 0;

setInterval(async () => {
    const start = new Date();
    try {
        if (running > 0) {
            throw new Error("Already running");
        }

        running++;

        const school = await rp(`https://db.yourbcabus.com/schools/${config.school}`);

        const now = luxon.DateTime.local().setZone(school.timezone);
        const data = await rp(`https://db.yourbcabus.com/schools/${config.school}/dismissal?date=${Math.floor(now.toSeconds())}`, {
            json: true
        });

        if (!data.ok) {
            throw new Error("Failed to fetch dismissal");
        }
        if (!data.found) {
            throw new Error("Dismissal not found");
        }
        if (!data.dismissal_time) {
            throw new Error("Dismissal lacks a dismissal time");
        }

        const dismissal = now.set({
            hour: Math.floor(data.dismissal_time / 3600),
            minute: Math.floor(data.dismissal_time / 60) % 60,
            second: data.dismissal_time % 60
        });

        if (now >= dismissal) {
            const recentRow = await util.promisify(db.get.bind(db))("SELECT MAX(date) AS maxDate FROM messages_sent WHERE ok > 0;");

            if (recentRow.maxDate === null || dismissal > luxon.DateTime.fromSeconds(recentRow.maxDate)) {
                console.log("Sending...");

                const stmt = db.prepare("INSERT INTO messages_sent (date, ok) VALUES (?, 1)");

                const payload = {
                    topic: `school.${config.school}.dismissal`,
                    data: {
                        dismissal: dismissal.toJSON()
                    },
                    apns: {
                        payload: {
                            aps: {
                                contentAvailable: true
                            }
                        }
                    }
                };

                await firebase.messaging().send(payload);
                console.log("Sent!");
                console.log(payload);

                await util.promisify(stmt.run.bind(stmt))(Math.floor(now.toSeconds()));
            }
        }
    } catch (e) {
        console.error(e.stack);
        const stmt = db.prepare("INSERT INTO messages_sent (date, ok, result) VALUES (strftime('%s', 'now'), 0, ?);");
        await util.promisify(stmt.run.bind(stmt))(e.stack);
    } finally {
        running--;
        console.log(`Finished execution. Time: ${(new Date().getTime() - start.getTime()) / 1000} ms`);
    }
}, 60 * 1000);
