const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const functions = require('../utils/functions.js');
const fs = require('fs');

async function ffavg(bot, api, interaction, clan, limit, include_all_players) {
    // Check if the command was run by an interaction or called by another function
    if (interaction != null) {
        await interaction.deferReply();
        clan = interaction.options.getString('clan');
        if (functions.isRegisteredClan(bot, interaction, interaction.channel, clan) == false) // Check if the clan is registered
            return
        limit = interaction.options.getInteger('limit');
        include_all_players = interaction.options.getBoolean('include_all_players');
    }

    // Get the clan members
    let clanMembers = null
    try {
        clanMembers = await api.getClanMembers(clan)
    } catch (error) {
        functions.errorEmbed(bot, interaction, interaction.channel, error)
        return
    }
    const clanMembersMap = {};
    clanMembers.forEach(clanMember => {
        clanMembersMap[clanMember.tag] = clanMember;
    });

    // Get the clans' score history
    let avg = await functions.fetchHist(clan.substring(1));
    // console.log(JSON.stringify(avg));
    let avgArray = {};
    let seasonId = avg.items[0].seasonId;
    // if (avg.items[0].sectionIndex < 3)
    //     seasonId = avg.items[0].seasonId - 1;
    // Initialize the dictionary with the last week
    for (let h = 0; h < avg.items[0].standings.length; h++) {
        // if (!limit)
        //     break;
        if (avg.items[0].standings[h].clan.tag == clan) {
            for (let p = 0; p < avg.items[0].standings[h].clan.participants.length; p++) {
                let participant = avg.items[0].standings[h].clan.participants[p];
                if (participant.fame > 0 || include_all_players) {
                    avgArray[participant.name] = {};
                    avgArray[participant.name]['clan'] = avg.items[0].standings[h].clan.name;
                    avgArray[participant.name]['fame'] = participant.fame;
                    avgArray[participant.name]['array'] = [participant.fame, null, null, null, null, null, null, null, null, null];
                    avgArray[participant.name]['count'] = 1;
                    avgArray[participant.name]['decksUsed'] = [participant.decksUsed, null, null, null, null, null, null, null, null, null];

                    try { // May be empty and fail if the player is not in the clan anymore
                        avgArray[participant.name]['expLevel'] = clanMembersMap[participant.tag].expLevel;
                        avgArray[participant.name]['role'] = clanMembersMap[participant.tag].role;
                        if (clanMembersMap[participant.tag].role == 'coLeader' || clanMembersMap[participant.tag].role == 'leader')
                            avgArray[participant.name]['staff'] = true;
                        else
                            avgArray[participant.name]['staff'] = false;
                    } catch (error) {
                        avgArray[participant.name]['expLevel'] = 0;
                        avgArray[participant.name]['role'] = '';
                        avgArray[participant.name]['staff'] = false;
                    }
                }
            }
        }
    }
    // Update the dictionary with the other weeks and calculate the average
    for (let p = 1; p < avg.items.length; p++) {
        if (limit && p >= limit) { // Choose the number of weeks to check
            break;
        }
        if (!limit && avg.items[p].seasonId != seasonId) { // Check only the last season
            break;
        }
        for (let h = 0; h < avg.items[p].standings.length; h++) {
            if (avg.items[p].standings[h].clan.tag == clan) {
                for (let q = 0; q < avg.items[p].standings[h].clan.participants.length; q++) {
                    let participant = avg.items[p].standings[h].clan.participants[q];
                    if (!(participant.name in avgArray) && include_all_players) {
                        avgArray[participant.name] = {};
                    }
                    else if (!(participant.name in avgArray)) {
                        continue;
                    }
                    if (avgArray[participant.name]['fame'] > 0) {
                        avgArray[participant.name]['clan'] = avg.items[p].standings[h].clan.name;
                        avgArray[participant.name]['fame'] += participant.fame;
                        avgArray[participant.name]['array'][p] = participant.fame;
                        avgArray[participant.name]['count'] += 1;
                        avgArray[participant.name]['decksUsed'][p] = participant.decksUsed;

                        try { // May be empty and fail if the player is not in the clan anymore
                            avgArray[participant.name]['expLevel'] = clanMembersMap[participant.tag].expLevel;
                            avgArray[participant.name]['role'] = clanMembersMap[participant.tag].role;
                            if (clanMembersMap[participant.tag].role == 'coLeader' || clanMembersMap[participant.tag].role == 'leader')
                                avgArray[participant.name]['staff'] = true;
                            else
                                avgArray[participant.name]['staff'] = false;
                        } catch (error) {
                            avgArray[participant.name]['expLevel'] = 0;
                            avgArray[participant.name]['role'] = '';
                            avgArray[participant.name]['staff'] = false;
                        }
                    }
                    else {
                        avgArray[participant.name]['clan'] = avg.items[p].standings[h].clan.name;
                        avgArray[participant.name]['fame'] = participant.fame;
                        avgArray[participant.name]['array'] = [null, null, null, null, null, null, null, null, null, null];
                        avgArray[participant.name]['array'][p] = participant.fame;
                        avgArray[participant.name]['count'] = 1;
                        avgArray[participant.name]['decksUsed'] = [null, null, null, null, null, null, null, null, null, null];
                        avgArray[participant.name]['decksUsed'][p] = participant.decksUsed;

                        try { // May be empty and fail if the player is not in the clan anymore
                            avgArray[participant.name]['expLevel'] = clanMembersMap[participant.tag].expLevel;
                            avgArray[participant.name]['role'] = clanMembersMap[participant.tag].role;
                            if (clanMembersMap[participant.tag].role == 'coLeader' || clanMembersMap[participant.tag].role == 'leader')
                                avgArray[participant.name]['staff'] = true;
                            else
                                avgArray[participant.name]['staff'] = false;
                        } catch (error) {
                            avgArray[participant.name]['expLevel'] = 0;
                            avgArray[participant.name]['role'] = '';
                            avgArray[participant.name]['staff'] = false;
                        }
                    }
                }
            }
        }
    }
    // Sort the dictionary by average
    const sortedAvgArray = Object.entries(avgArray).sort((a, b) => {
        return b[1].fame / b[1].count - a[1].fame / a[1].count;
    });

    const sortedAvgObject = Object.fromEntries(sortedAvgArray);

    // Make the data for the Excel file
    for (const [key, value] of Object.entries(sortedAvgObject)) {
        avgArray[key]['fame'] = value['fame'] / value['count'];
    }

    // console.log(sortedAvgObject);
    if (interaction != null) {
        const fileName = (Math.random() + 1).toString(36).substring(7);
        await functions.excel(sortedAvgObject, fileName)
        const excel = new AttachmentBuilder(fileName + '.xlsx');
        const png = new AttachmentBuilder(fileName + '.png');
        await interaction.editReply({ content: '__**Players\' averages**__ :', files: [excel, png] });
        try {
            fs.unlinkSync('./' + fileName + '.xlsx')
            fs.unlinkSync('./' + fileName + '.png')
            // Files removed
        } catch (err) {
            console.error(err)
        }
    }
    return sortedAvgObject;
}

async function fffamilyavg(bot, api, interaction, limit, include_all_players) {
    // Check if the command was run by an interaction or called by another function
    if (interaction != null) {
        await interaction.deferReply();
        limit = interaction.options.getInteger('limit');
        include_all_players = interaction.options.getBoolean('include_all_players');
    }

    // Map the clans of the current guild
    const clans = registeredClans
    const guildClans = clans.filter(clan => clan.guild === interaction.guild.id);

    let avg = [];
    let familyClans = {};
    for (let clan of guildClans) {
        const result = await ffavg(bot, api, null, clan.tag, limit, include_all_players);
        avg.push(result);
        let clanInfo = null
        try {
            clanInfo = await api.getClanByTag(clan.tag) // Get the clans' info from the Supercell API
            clan.clanWarTrophies = clanInfo.clanWarTrophies;
            clan.playersCount = 0;
            familyClans[clanInfo.name] = clan;
        } catch (error) {
            functions.errorEmbed(bot, interaction, interaction.channel, error)
            return
        }
    }
    // console.log(avg);

    // Sort the clans dictionary by War Trophies
    const sortedFamilyClans = Object.entries(familyClans).sort((a, b) => {
        return b[1].clanWarTrophies - a[1].clanWarTrophies;
    });
    // console.log(sortedFamilyClans);

    // Merge the results of the clans
    const mergedAvg = {};
    avg.forEach(json => {
        Object.keys(json).forEach(key => {
            mergedAvg[key] = json[key];
        });
    });
    // console.log(mergedAvg);

    // Sort the players by average and exp level
    const sortedAvgArray = Object.entries(mergedAvg).sort((a, b) => {
        if (a[1].expLevel === 0) return 1; // Move absent players (expLevel = 0) to the end
        if (b[1].expLevel === 0) return -1; // Move absent players (expLevel = 0) to the end
        if (b[1].fame === a[1].fame) {
            return b[1].expLevel - a[1].expLevel;
        }
        return b[1].fame - a[1].fame;
    });

    const sortedAvgObject = Object.fromEntries(sortedAvgArray);

    // console.log("Sorted : ", sortedAvgObject);


    // Browse the players and attribute them to the target clans
    let clanIndex = 0;
    for (const [player, playerInfo] of Object.entries(sortedAvgObject)) {
        // Staff players are not moved
        if (playerInfo.staff) {
            playerInfo.targetClan = playerInfo.clan;
            for (let clan of sortedFamilyClans) {
                if (clan[1].name === playerInfo.clan) {
                    clan[1].playersCount += 1;
                    break;
                }
            }
            playerInfo.movement = "🟰 (Staff)";
            continue;
        }
        // Check if the player is eligible for the first clan (expLevel >= 54 that is to say tower level 15)
        if (clanIndex === 0 && playerInfo.expLevel >= 54 && sortedFamilyClans[clanIndex][1].playersCount < 50) {
            sortedFamilyClans[clanIndex][1].playersCount += 1;
            playerInfo.targetClan = sortedFamilyClans[clanIndex][1].name; // Add the targetClan value
        } else {
            if (playerInfo.expLevel == 0) {
                playerInfo.targetClan = "";
                playerInfo.movement = "❌";
                continue;
            }

            // Check if the clan is full or if the player is eligible for the first clan
            if (sortedFamilyClans[clanIndex][1].playersCount >= 50 || (clanIndex === 0 && playerInfo.expLevel < 54)) {
                clanIndex++;
            }

            // Add the player to the current clan
            sortedFamilyClans[clanIndex][1].playersCount += 1;
            playerInfo.targetClan = sortedFamilyClans[clanIndex][1].name; // Add the targetClan value

            // If the player is not eligible for the first clan and the first clan isn't full, continue to add players to the first clan for the next players
            if (sortedFamilyClans[clanIndex][1].playersCount < 50 || (clanIndex === 0 && playerInfo.expLevel < 54)) {
                clanIndex--;
            }
        }

        // Determine player movement
        if (playerInfo.targetClan === playerInfo.clan) {
            playerInfo.movement = '🟰';
        } else if (sortedFamilyClans.findIndex(clan => clan[1].name === playerInfo.targetClan) < sortedFamilyClans.findIndex(clan => clan[1].name === playerInfo.clan)) {
            playerInfo.movement = '🔺';
        } else {
            playerInfo.movement = '🔽';
        }
    }
    // console.log(sortedAvgObject);


    if (interaction != null) {
        const fileName = (Math.random() + 1).toString(36).substring(7);
        await functions.excel(sortedAvgObject, fileName, true)
        const excel = new AttachmentBuilder(fileName + '.xlsx');
        const png = new AttachmentBuilder(fileName + '.png');
        await interaction.editReply({ content: '__**Family players\' averages**__ :', files: [excel, png] });
        try {
            fs.unlinkSync('./' + fileName + '.xlsx')
            fs.unlinkSync('./' + fileName + '.png')
            // Files removed
        } catch (err) {
            console.error(err)
        }
    }
}

module.exports = {
    ffavg,
    fffamilyavg,
    data: new SlashCommandBuilder()
        .setName('ffavg')
        .setDescription('Replies the players\' averages !')
        .addSubcommand(subcommand =>
            subcommand
                .setName('clan')
                .setDescription('Replies the players\' averages of a clan !')
                .addStringOption(option =>
                    option.setName('clan')
                        .setDescription('Clan to check')
                        .setAutocomplete(true)
                        .setRequired(true))
                .addIntegerOption(option =>
                    option.setName('limit')
                        .setDescription('Max weeks to check (from 1 to 10)'))
                .addBooleanOption(option =>
                    option.setName('include_all_players')
                        .setDescription('Include players curently out of the clan'))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('family')
                .setDescription('Replies the players\' averages of the clans\' family !')
                .addIntegerOption(option =>
                    option.setName('limit')
                        .setDescription('Max weeks to check (from 1 to 10)'))
                .addBooleanOption(option =>
                    option.setName('include_all_players')
                        .setDescription('Include players curently out of the clan'))
        ),

    async execute(bot, api, interaction) {
        switch (interaction.options.getSubcommand()) {
            case 'clan':
                ffavg(bot, api, interaction, null, null, null);
                break;
            case 'family':
                fffamilyavg(bot, api, interaction, null, null);
                break;
        }
    },
};