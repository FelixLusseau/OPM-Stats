const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const sqlite3 = require('sqlite3').verbose();
const functions = require('../utils/functions.js');
const ffhour = require('./ffhour.js');

// Function to register a clan for the Discord server
async function registerClan(bot, api, interaction) {
    await interaction.deferReply();
    const abbr = interaction.options.getString('abbr');
    const tag = interaction.options.getString('tag');
    let clan = null

    valid = false
    // Check if the hour given is valid
    if (functions.isValidTag(tag)) {
        valid = true;

        // Get the real name of the clan
        try {
            clan = await api.getClanByTag(tag)// Get the clans' info from the Supercell API
        } catch (error) {
            functions.errorEmbed(bot, interaction, channel, error)
            return
        }

        // Register the clan into the database
        try {
            // Open the database
            let db = new sqlite3.Database('./db/OPM.sqlite3', sqlite3.OPEN_READWRITE, (err) => {
                if (err) {
                    console.error(err.message);
                }
            });

            // Delete previous clan entry from the database
            let sql = `DELETE FROM Clans WHERE Guild=? AND Tag=?`;
            db.run(sql, [interaction.guildId, tag], function (err) {
                if (err) {
                    return console.error(err.message);
                }
                // console.log(`Row(s) deleted ${this.changes}`);
            });
            // Insert a new clan entry into the database
            db.run(`INSERT INTO Clans (Guild, Name, Abbr, Tag) VALUES ("${interaction.guildId}", "${clan.name}", "${abbr}", "${tag}")`, function (err) {
                if (err) {
                    return console.log(err.message);
                }
                // get the last insert id
                // console.log(`A row has been inserted with rowid ${this.lastID}`);
                // Reload the registered clans cache
                functions.loadRegisteredClans()
            });

            // Close the database
            db.close((err) => {
                if (err) {
                    console.error(err.message);
                }
            });
        } catch (err) {
            console.error(err);
        }
    }
    else {
        valid = false;
    }

    const registerEmbed = functions.generateEmbed(bot);
    try {
        registerEmbed
            .setDescription((valid ? tag + " (" + clan.name + ") registered as **" + abbr + "** on this server !" : "**" + tag + "** is not a valid tag !"))
    } catch (e) {
        console.log(e);
    }

    interaction.editReply({ embeds: [registerEmbed] });
}

// Function to unregister a clan for the Discord server
async function unregisterClan(bot, api, interaction) {
    await interaction.deferReply();
    const tag = interaction.options.getString('abbr');
    if (functions.isRegisteredClan(bot, interaction, interaction.channel, tag) == false) // Check if the clan is registered
        return
    const abbr = clansDict[tag]

    // Unregister the clan from the database
    try {
        // Open the database
        let db = new sqlite3.Database('./db/OPM.sqlite3', sqlite3.OPEN_READWRITE, (err) => {
            if (err) {
                console.error(err.message);
            }
        });

        // Delete clan entry from the database
        let sql = `DELETE FROM Clans WHERE Guild=? AND Tag=?`;
        db.run(sql, [interaction.guildId, tag], function (err) {
            if (err) {
                return console.error(err.message);
            }
            // console.log(`Row(s) deleted ${this.changes}`);
            // Reload the registered clans cache
            functions.loadRegisteredClans()
        });

        // Close the database
        db.close((err) => {
            if (err) {
                console.error(err.message);
            }
        });

    } catch (err) {
        console.error(err);
    }

    // Try to remove any associated schedules and reports using rmHour
    try {
        await ffhour.rmHour(bot, api, null, tag, interaction.guildId);
    } catch (e) {
        // Silently ignore if there are no schedules to remove
        console.log('No schedules to remove for clan ' + tag);
    }

    const unregisterEmbed = functions.generateEmbed(bot);
    try {
        unregisterEmbed
            .setDescription(("**" + abbr + "** is no longer registered on this server !"))
    } catch (e) {
        console.log(e);
    }

    interaction.editReply({ embeds: [unregisterEmbed] });
}

module.exports = {
    registerClan,
    unregisterClan,
    data: new SlashCommandBuilder()
        .setName('ffclanreg')
        .setDescription('Register or unregister a clan for this server (used in commands) !')
        .addSubcommand(subcommand =>
            subcommand
                .setName('register')
                .setDescription('Register a clan for this server (used in commands) !')
                .addStringOption(option =>
                    option.setName('abbr')
                        .setDescription('The clan abbreviation to add')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('tag')
                        .setDescription('The tag with # of the clan')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('unregister')
                .setDescription('Unregister a clan for this server (used in commands) !')
                .addStringOption(option =>
                    option.setName('abbr')
                        .setDescription('The clan abbreviation to remove')
                        .setAutocomplete(true)
                        .setRequired(true))),
    async execute(bot, api, interaction) {
        switch (interaction.options.getSubcommand()) {
            case 'register':
                registerClan(bot, api, interaction)
                break;
            case 'unregister':
                unregisterClan(bot, api, interaction)
                break;
        }
    },
};