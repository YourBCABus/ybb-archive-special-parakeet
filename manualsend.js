const fs = require("fs");
const path = require("path");
const firebase = require("firebase-admin");

const serviceAccount = JSON.parse(fs.readFileSync(path.join(__dirname, "service-account.json"), "utf8"));

firebase.initializeApp({
    credential: firebase.credential.cert(serviceAccount)
});

firebase.messaging().send({
    topic: `school.5bca51e785aa2627e14db459.dismissal.banner`,
    data: {
        dismissal: "asdf"
    },
    apns: {
        payload: {
            aps: {
                alert: {
                    title: "Dismissal Summary",
                    body: "Open the app to add a destination for your dismissal summary."
                },
                category: "DISMISSAL_SUMMARY",
                mutableContent: true
            }
        }
    }
}).then(() => {
    console.log("Sent!");
});