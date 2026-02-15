const { Events, ActivityType } = require('discord.js');
require("dotenv").config();
const schedule = require('../utils/schedule.js');
const functions = require('../utils/functions.js');

module.exports = {
    name: Events.ClientReady,
    once: true,
    async execute(bot) {
        console.log("  ___  ____  __  __      ____  _        _       ")
        console.log(" / _ \\|  _ \\|  \\/  |    / ___|| |_ __ _| |_ ___")
        console.log("| | | | |_) | |\\/| |____\\___ \\| __/ _` | __/ __|")
        console.log("| |_| |  __/| |  | |_____|__) | || (_| | |_\\__ \\")
        console.log(" \\___/|_|   |_|  |_|    |____/ \\__\\__,_|\\__|___/")

        console.log(`\n\x1b[36m[${new Date().toISOString()}]\x1b[0m Ready! Logged in as ${bot.user.tag}`);
        bot.user.setActivity('Watching your stats', { type: ActivityType.Watching });

        // Load the report times from the reset-hours folder and schedule the reports
        global.clansDict = {}
        global.guildMembers = {}

        schedule.loadSchedules(bot)

        // console.log("\nAccessible Channels :")
        // bot.channels.cache.filter(channel => channel.type === 0).forEach(channel => {
        //     console.log("- " + channel.id, channel.name, "(" + channel.guild.name + ")");
        // });

        console.log("\nCurrent Guilds :")
        bot.guilds.cache.forEach(guild => {
            console.log("- " + guild.id + " : " + guild.name);
        });

        // Get the guild members at the bot startup
        global.guildsDict = {};
        bot.guilds.cache.forEach((guild) => {
            guildsDict[guild.id] = guild;
        });
        // console.log(guildsDict);
        schedule.getGuildMembers(guildsDict)

        global.registeredClans = [];
        await functions.loadRegisteredClans()
    },
};