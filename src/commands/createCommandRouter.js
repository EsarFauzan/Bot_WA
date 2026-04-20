const { createBasicCommandsHandler } = require('./basicCommands');
const { createReminderJadwalCommandsHandler } = require('./reminderJadwalCommands');
const { createMediaCommandsHandler } = require('./mediaCommands');
const { createUtilityCommandsHandler } = require('./utilityCommands');
const { createProductivityCommandsHandler } = require('./productivityCommands');

function createCommandRouter(deps) {
    const handleBasicCommands = createBasicCommandsHandler({
        userModes: deps.userModes,
        stats: deps.stats,
        history: deps.history,
        buildHelpMenu: deps.buildHelpMenu,
        getHealthStatus: deps.getHealthStatus
    });

    const handleReminderJadwalCommands = createReminderJadwalCommandsHandler({
        axios: deps.axios,
        groupReminders: deps.groupReminders,
        saveReminders: deps.saveReminders,
        groupJadwal: deps.groupJadwal,
        saveJadwalGroups: deps.saveJadwalGroups,
        getTimeContextInZone: deps.getTimeContextInZone,
        NAMA_HARI: deps.NAMA_HARI,
        JADWAL_KULIAH: deps.JADWAL_KULIAH
    });

    const handleMediaCommands = createMediaCommandsHandler({
        client: deps.client,
        path: deps.path,
        fs: deps.fs,
        sharp: deps.sharp,
        axios: deps.axios,
        MessageMedia: deps.MessageMedia,
        buatStiker: deps.buatStiker,
        kirimStiker: deps.kirimStiker,
        optimizeVideo: deps.optimizeVideo,
        downloadIGVideo: deps.downloadIGVideo,
        downloadTikTokVideo: deps.downloadTikTokVideo,
        downloadYouTubeVideo: deps.downloadYouTubeVideo,
        removeBackground: deps.removeBackground,
        upscaleImage: deps.upscaleImage
    });

    const handleUtilityCommands = createUtilityCommandsHandler({
        axios: deps.axios
    });

    const handleProductivityCommands = createProductivityCommandsHandler({
        userTodos: deps.userTodos,
        saveTodos: deps.saveTodos,
        groupNotes: deps.groupNotes,
        saveNotes: deps.saveNotes,
        LINK_AKADEMIK: deps.LINK_AKADEMIK,
        saveAkademik: deps.saveAkademik,
        jadwalUjian: deps.jadwalUjian,
        saveUjian: deps.saveUjian,
        schedule: deps.schedule,
        client: deps.client
    });

    return async function handleCommand(msg) {
        const uid = msg.from;
        const cmd = msg.body.toLowerCase().trim();

        if (await handleBasicCommands({ cmd, msg, uid })) return;
        if (await handleReminderJadwalCommands({ cmd, msg, uid })) return;
        if (await handleMediaCommands({ cmd, msg, uid })) return;
        if (await handleUtilityCommands({ cmd, msg, uid })) return;
        if (await handleProductivityCommands({ cmd, msg, uid })) return;
    };
}

module.exports = {
    createCommandRouter
};
