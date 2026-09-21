const sessionReportRepository = require('../repositories/sessionReport.repository');
const effectCommandRepository = require('../repositories/effectCommand.repository');
const sessionAnalyticsSummaryRepository = require('../repositories/sessionAnalyticsSummary.repository');
const { makeLogger } = require('../utils/logger');

const logger = makeLogger('sessionReport');

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

  const [eventCounts, totalDiamonds, effectCommands, topGifters, topCommenters, uniqueViewers] = await Promise.all([
    sessionReportRepository.countEventsByType(sessionId),
    sessionReportRepository.sumDiamonds(sessionId),
    effectCommandRepository.findBySessionId(sessionId),
    sessionReportRepository.topGifters(sessionId),
    sessionReportRepository.topCommenters(sessionId),
    sessionReportRepository.countUniqueViewers(sessionId),
  ]);

  const countByType = Object.fromEntries(eventCounts.map((row) => [row.event_type, Number(row.count)]));
  const totalComments = countByType.CHAT || 0;
  const totalJoins = countByType.JOIN || 0;
  const totalGifts = countByType.GIFT || 0;

  const report = await sessionReportRepository.create({
    sessionId,
    durationSeconds,
    totalComments,
    totalJoins,
    totalGifts,
    totalDiamonds,
    effectsTriggered: effectCommands.map((ec) => ({
      effectCode: ec.payload?.effectCode ?? null,
      ruleId: ec.rule_id,
      issuedAt: ec.payload?.issuedAt ?? ec.sent_at,
      status: ec.status,
    })),
    topContributors: { topGifters, topCommenters },
  });

  // Analytics warehouse (session_analytics_summary): best-effort, separate
  // from the FR-36 report above -- a failure here must not lose the report
  // that was already saved.
  try {
    const minutes = durationSeconds / 60;
    await sessionAnalyticsSummaryRepository.create({
      sessionId,
      liveStreamId: session.live_stream_id,
      hostUsername: session.host_username,
      startedAt: session.connected_at,
      endedAt: session.disconnected_at,
      durationSeconds,
      totalEvents: totalComments + totalJoins + totalGifts,
      totalComments,
      totalJoins,
      totalGifts,
      totalDiamonds,
      uniqueViewers,
      commentsPerMinute: minutes > 0 ? Number((totalComments / minutes).toFixed(2)) : 0,
      diamondsPerMinute: minutes > 0 ? Number((totalDiamonds / minutes).toFixed(2)) : 0,
      totalEffectsTriggered: effectCommands.length,
    });
  } catch (err) {
    logger.error('Failed to persist session_analytics_summary', { sessionId, error: err.message });
  }

  logger.info('Generated session report', { sessionId, durationSeconds, effectCount: effectCommands.length });
  return report;
}

module.exports = { generateReport };
