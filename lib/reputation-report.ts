import { fleetScore, type Profile, type Shift } from "./fleet";
import { emptyFilters, filterShifts, shiftTotals } from "./shifts";
export type ReportOptions = {
  includeHistory: boolean;
  includeEarnings: boolean;
  includeBio: boolean;
};
export const defaultReportOptions: ReportOptions = {
  includeHistory: false,
  includeEarnings: false,
  includeBio: false,
};
// Explicit allowlist: notes, recognition, IDs, and unselected details never
// enter the printable view model, even as hidden DOM content.
export function reputationReport(
  profile: Profile,
  shifts: Shift[],
  options: ReportOptions = defaultReportOptions,
  demo = false,
) {
  const sorted = filterShifts(shifts, emptyFilters);
  const totals = shiftTotals(shifts);
  return {
    generatedAt: new Date().toISOString(),
    demo,
    driver: {
      name: profile.name,
      city: profile.city,
      ...(options.includeBio ? { bio: profile.bio } : {}),
    },
    evidence:
      "Self-reported. Not verified by delivery platforms. This is a driver-provided record, not a background check or safety certification.",
    score: fleetScore(profile, shifts),
    totals: {
      shifts: totals.count,
      hours: totals.hours,
      trips: totals.trips,
      ...(options.includeEarnings ? { earnings: totals.earnings } : {}),
    },
    period: sorted.length
      ? { from: sorted[sorted.length - 1].date, to: sorted[0].date }
      : null,
    ...(options.includeHistory
      ? {
          history: sorted.slice(0, 10).map((s) => ({
            platform: s.platform,
            date: s.date,
            time: s.time,
            duration: s.duration,
            deliveries: s.deliveries,
            ...(options.includeEarnings ? { earnings: s.earnings } : {}),
          })),
        }
      : {}),
  };
}
