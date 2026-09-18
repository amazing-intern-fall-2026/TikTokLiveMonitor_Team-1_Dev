const sessionReportRepository = require('../repositories/sessionReport.repository');
const effectCommandRepository = require('../repositories/effectCommand.repository');

/**
 * FR-36: aggregates one session's events + effects into a summary report
 * and persists it. Called once from liveStream.service.js's closeSession(),
 * right after the session is marked disconnected -- never on-demand, so a
 * report always reflects the session's final state.
 */
async function generateReport(sessionId) {
  const session = await sessionReportRepository.findSessionWithStream(sessionId);
  if (!session) {
    throw new Error(`No session found for id=${sessionId}`);
  }

  const endedAt = session.disconnected_at ? new Date(session.disconnected_at) : new Date();
  const durationSeconds = Math.max(0, Math.round((endedAt.getTime() - new Date(session.connected_at).getTime()) / 1000));

  const [eventCounts, totalDiamonds, effectCommands, topGifters, topCommenters] = await Promise.all([
    sessionReportRepository.countEventsByType(sessionId),
    sessionReportRepository.sumDiamonds(sessionId),
    effectCommandRepository.findBySessionId(sessionId),
    sessionReportRepository.topGifters(sessionId),
    sessionReportRepository.topCommenters(sessionId),
  ]);

  const countByType = Object.fromEntries(eventCounts.map((row) => [row.event_type, Number(row.count)]));

  const report = await sessionReportRepository.create({
    sessionId,
    durationSeconds,
    totalComments: countByType.CHAT || 0,
    totalJoins: countByType.JOIN || 0,
    totalGifts: countByType.GIFT || 0,
    totalDiamonds,
    effectsTriggered: effectCommands.map((ec) => ({
      effectCode: ec.payload?.effectCode ?? null,
      ruleId: ec.rule_id,
      issuedAt: ec.payload?.issuedAt ?? ec.sent_at,
      status: ec.status,
    })),
    topContributors: { topGifters, topCommenters },
  });

  console.log(`[SessionReport] Generated report for session #${sessionId} (${durationSeconds}s, ${effectCommands.length} effect(s))`);
  return report;
}

module.exports = { generateReport };
