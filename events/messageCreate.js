const { Events, AttachmentBuilder } = require('discord.js');
const functions = require('../utils/functions.js');
const fs = require('fs');
const ffplayer = require('../commands/ffplayer.js');

async function royaleAPIHistory(bot, message, placeholder, tag) {
    try {
        const statusCode = await functions.http_head("/player/" + tag);
        // console.log('Status Code:', statusCode);
        if (statusCode == 200) {
            let url = "https://royaleapi.com/player/" + tag
            await ffplayer.ffplayer(bot, api, null, message.channel, '#' + tag);
            if (await functions.playerHistory(bot, message.channel, url)) {
                const playerHistoryList = new AttachmentBuilder('playerHistory.png');
                const playerHistoryCanvas = new AttachmentBuilder('playerHistoryCanvas.png');
                await message.channel.send({ content: url, files: [playerHistoryList, playerHistoryCanvas] });
                // Remove files
                fs.unlinkSync('./playerHistory.png')
                fs.unlinkSync('./playerHistoryCanvas.png')
            }
        }
        else
            functions.errorEmbed(bot, null, message.channel, "Invalid tag");
    } catch (error) {
        console.error('Error:', error);
    }
    try {
        placeholder.delete(); // Delete the placeholder message
    }
    catch (error) {
        console.error(error);
    }
}

module.exports = {
    name: Events.MessageCreate,
    async execute(bot, api, message) {
        if (message.author.tag == bot.user.tag) return; // Ignore messages from the bot itself
        let placeholder = null
        // if (message.content == 'ds') {
        //     if (tag = await functions.extractDeckShopTag({})) {
        // Check if the message is a DeckShop joining message and send the RoyaleAPI Profile url into the channel
        if (message.author.tag === 'Deck Shop Logs#0000') {
            if (tag = await functions.extractDeckShopTag(message)) {
                console.log(`\x1b[36m[${new Date().toISOString()}]\x1b[0m Tag received from DeckShop bot:`, tag);
                placeholder = await message.channel.send("Tag received from DeckShop bot !\nSearching... <a:Mag:1186624382982963290>") // Send a placeholder message to show that the bot is working
                await message.channel.sendTyping();
                royaleAPIHistory(bot, message, placeholder, tag.substring(1).toUpperCase())
            }
        }

        // Check if the message contains a tag and send the RoyaleAPI Profile url into the channel
        const regex = /\#[a-zA-Z0-9]{6,10}\b/g
        if (message.content.search(regex) >= 0) {
            console.log(`\x1b[36m[${new Date().toISOString()}]\x1b[0m Tag received:`, message.content.match(regex)[0]);
            placeholder = await message.channel.send("Tag received !\nSearching... <a:Mag:1186624382982963290>") // Send a placeholder message to show that the bot is working
            await message.channel.sendTyping();
            const tag = message.content.match(regex)[0].substring(1).toUpperCase();
            royaleAPIHistory(bot, message, placeholder, tag)
        }
    }
};
