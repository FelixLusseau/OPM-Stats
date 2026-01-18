const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const functions = require('../utils/functions.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ffhelp')
        .setDescription('Shows the help menu !'),
    async execute(bot, api, interaction) {
        const Help = "\u200B\n__Commands list__ :\n\n"
            + "- `/ffhelp` : Shows this help menu\n"
            + "- `/ffattacks` : Shows the remaining attacks of the day\n"
            + "- `/ffavg` : Shows the average war points of the players sending an Excel spreadsheet and the associated png\n"
            + "- `/ffclanreg` : Manage the clans for the server's commands\n"
            + "- `/ffhour` : Manage the hours of the daily reports and resets\n"
            // + "- `/ffgetrotates` : Shows the rotations of the players between the clans\n"
            + "- `/ffmembers` : Shows the members of the clan\n"
            + "- `/ffopponents` : Shows information about the war opponents\n"
            + "- `/ffplayer` : Shows the player's profile\n"
            + "- `/ffrace` : Shows the current war day status (or Colosseum)\n"
            + "- `/ffresults` : Shows the points of all the war participants\n"
            + "- `/ffreport` : Shows the war report\n"
            + "- `/ffriver` : Shows the current river race (or Colosseum)\n"
            // + "- `/ffrmrotate` : Removes an entry from the rotations\n"
            // + "- `/ffsetrotates` : Sets the rotations of the players between the clans\n"
            + "- `/fftag` : Shows the information of a not registered clan\n"
            + "- `/fftournament` : Shows information about a tournament\n"
            + "\u200B"

        const helpEmbed = functions.generateEmbed(bot);
        try {
            helpEmbed
                .setTitle('__Help menu__ :')
                .setDescription(Help)
        } catch (e) {
            console.log(e);
        }

        interaction.reply({ embeds: [helpEmbed] });
    },
};