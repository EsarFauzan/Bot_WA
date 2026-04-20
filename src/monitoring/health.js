function formatUptime(totalSeconds) {
    const seconds = Math.max(0, Math.floor(totalSeconds || 0));
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    const parts = [];
    if (days) parts.push(`${days}d`);
    if (hours || days) parts.push(`${hours}h`);
    if (minutes || hours || days) parts.push(`${minutes}m`);
    parts.push(`${secs}s`);
    return parts.join(' ');
}

function formatBytes(bytes) {
    const n = Number(bytes || 0);
    const mb = n / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
}

function buildHealthReport(input) {
    const {
        startedAt,
        stats,
        historySize,
        cooldownSize,
        groupRemindersSize,
        groupJadwalSize,
        groupNotesSize,
        userTodosSize,
        jadwalUjianSize,
        schedulersStarted,
        healthMonitorStarted,
        timezone
    } = input;

    const uptimeSeconds = (Date.now() - new Date(startedAt).getTime()) / 1000;
    const mem = process.memoryUsage();

    return [
        'HEALTH BOT',
        '─────────────────────',
        `Uptime           : ${formatUptime(uptimeSeconds)}`,
        `Timezone         : ${timezone}`,
        `Total chat       : ${stats?.totalChats || 0}`,
        `Last active      : ${stats?.lastActive || '-'}`,
        `History user     : ${historySize}`,
        `Cooldown cache   : ${cooldownSize}`,
        `Reminder group   : ${groupRemindersSize}`,
        `Jadwal group     : ${groupJadwalSize}`,
        `Notes bucket     : ${groupNotesSize}`,
        `Todos bucket     : ${userTodosSize}`,
        `Jadwal ujian     : ${jadwalUjianSize}`,
        `Scheduler ready  : ${schedulersStarted ? 'yes' : 'no'}`,
        `Health monitor   : ${healthMonitorStarted ? 'yes' : 'no'}`,
        `RSS memory       : ${formatBytes(mem.rss)}`,
        `Heap used        : ${formatBytes(mem.heapUsed)}`,
        `Heap total       : ${formatBytes(mem.heapTotal)}`,
        '─────────────────────'
    ].join('\n');
}

function buildHealthLogLine(input) {
    const report = buildHealthReport(input).split('\n');
    const uptimeLine = report.find((l) => l.startsWith('Uptime')) || 'Uptime: -';
    const chatLine = report.find((l) => l.startsWith('Total chat')) || 'Total chat: -';
    const rssLine = report.find((l) => l.startsWith('RSS memory')) || 'RSS: -';
    return `[HEALTH] ${uptimeLine} | ${chatLine} | ${rssLine}`;
}

module.exports = {
    buildHealthReport,
    buildHealthLogLine,
    formatUptime,
    formatBytes
};
