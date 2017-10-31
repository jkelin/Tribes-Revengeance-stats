const Discord = require('discord.js');
const Events = require("./events.js");

// Create a new webhook
const id = process.env.DISCORD_WEBHOOK_ID;
const token = process.env.DISCORD_WEBHOOK_TOKEN;


if (id && token) {
    const hook = new Discord.WebhookClient(id, token);

    // Send a message using the webhook
    setTimeout(() => {
        Events.filter(x => x.type == "chat-message").subscribe(e => {
            console.log(e);
            if (e.data && e.data.user && e.data.messageFriendly) {
                hook.send(e.data.messageFriendly, { username: e.data.user });
            }
        });
    }, 10 * 1000);
}
