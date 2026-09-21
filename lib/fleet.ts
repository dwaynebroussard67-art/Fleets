import { z } from "zod";
export const platforms = [
  "DoorDash",
  "Uber Eats",
  "Instacart",
  "Uber",
  "Lyft",
  "Other",
] as const;
export const profileSchema = z.object({
  name: z.string().trim().min(1, "Please enter your name.").max(60),
  city: z.string().trim().max(80),
  bio: z.string().trim().max(500),
  reliability: z.number().min(0).max(100).nullable(),
  safety: z.number().min(0).max(100).nullable(),
  rating: z.number().min(0).max(5).nullable(),
  contributions: z.number().int().min(0).max(100000),
  priorDeliveries: z.number().int().min(0).max(1000000),
});
export type Profile = z.infer<typeof profileSchema>;
export const shiftSchema = z.object({
  id: z.string().uuid(),
  platform: z.enum(platforms),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine(
      (d) =>
        !isNaN(Date.parse(d)) && new Date(d).toISOString().slice(0, 10) === d,
      "Choose a valid date.",
    )
    .refine((d) => d <= localDate(), "A shift cannot be in the future."),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  duration: z.number().min(0.25).max(24),
  deliveries: z.number().int().min(0).max(300),
  earnings: z.number().min(0).max(10000),
  note: z.string().max(5000),
  recognition: z.string().max(1200),
});
export type Shift = z.infer<typeof shiftSchema>;
export function localDate(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export const emptyProfile: Profile = {
  name: "Driver",
  city: "",
  bio: "",
  reliability: null,
  safety: null,
  rating: null,
  contributions: 0,
  priorDeliveries: 0,
};
export function fleetScore(profile: Profile, shifts: Shift[]) {
  const deliveries = shifts.reduce(
    (n, s) => n + s.deliveries,
    profile.priorDeliveries,
  );
  const components = [
    {
      name: "Reliability",
      weight: 25,
      value: profile.reliability,
      description: "Your self-reported on-time percentage.",
    },
    {
      name: "Safety",
      weight: 20,
      value: profile.safety,
      description: "Your self-reported incident-free shift percentage.",
    },
    {
      name: "Customer rating",
      weight: 25,
      value: profile.rating === null ? null : profile.rating * 20,
      description: "Your self-reported average rating, out of 5.",
    },
    {
      name: "Community",
      weight: 15,
      value: Math.min(100, (profile.contributions / 20) * 100),
      description:
        "Self-reported times helping another driver. 20 reaches full credit.",
    },
    {
      name: "Experience",
      weight: 15,
      value: Math.min(100, (deliveries / 1000) * 100),
      description:
        "Prior deliveries plus deliveries logged here. 1,000 reaches full credit.",
    },
  ];
  return {
    total: Math.round(
      components.reduce((n, c) => n + ((c.value ?? 0) * c.weight) / 10, 0),
    ),
    components,
    complete: components.every((c) => c.value !== null),
  };
}
export function recognitionFor(
  shift: Omit<Shift, "recognition">,
  previous: Shift[] = [],
) {
  const hours = `${shift.duration} ${shift.duration === 1 ? "hour" : "hours"}`;
  const work = shift.deliveries
    ? `${shift.deliveries} ${["Uber", "Lyft"].includes(shift.platform) ? "rides" : "deliveries"}`
    : "a shift";
  const variants = [
    `You put in ${hours} and completed ${work}. Behind every stop was someone counting on the work you do. That time matters.`,
    `${work[0].toUpperCase() + work.slice(1)} on ${shift.platform}. ${hours} of your day spent keeping someone else’s moving. This is work worth keeping a record of.`,
    `The app shows ${work}. It doesn’t show the ${hours} you gave to making them happen. Here, both count.`,
    `You showed up for ${hours} on ${shift.platform}. You don’t have to turn that effort into a perfect day for it to mean something.`,
    `${hours[0].toUpperCase() + hours.slice(1)} on the road, ${work} in the books. This part of your story belongs to you, not a platform.`,
    `You gave ${hours} to this shift. The planning, the waiting, the getting there — that’s all part of the work, too.`,
    `${work[0].toUpperCase() + work.slice(1)} didn’t happen on their own. You made time, took the wheel, and did the work for ${hours}. We see that.`,
    `Your ${shift.platform} shift is more than a line in an earnings report. It’s ${hours} of real effort, now recorded on your terms.`,
  ];
  const context = ` ${new Date(shift.date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}, ${shift.time}.`;
  for (let i = 0; i < variants.length; i++) {
    const candidate =
      variants[(previous.length + i) % variants.length] + context;
    if (!previous.some((s) => s.recognition === candidate)) return candidate;
  }
  let sequence = previous.length + 1;
  let candidate = "";
  do {
    candidate = `${variants[previous.length % variants.length]}${context} Entry ${sequence++} in your own work history.`;
  } while (previous.some((s) => s.recognition === candidate));
  return candidate;
}
export function demoData(): { profile: Profile; shifts: Shift[] } {
  const specs: [
    number,
    string,
    (typeof platforms)[number],
    number,
    number,
    number,
  ][] = [
    [0, "11:30", "DoorDash", 3.5, 12, 86.5],
    [1, "17:00", "Uber Eats", 4, 16, 112.75],
    [2, "10:00", "Instacart", 3, 8, 74.2],
    [3, "17:30", "DoorDash", 4.5, 18, 128.5],
    [5, "11:00", "Uber Eats", 3, 11, 81],
    [6, "16:00", "DoorDash", 4, 15, 104.25],
    [8, "12:00", "Instacart", 2.5, 7, 63],
    [10, "17:00", "Uber Eats", 4, 14, 97.5],
  ];
  const shifts: Shift[] = [];
  for (const [days, time, platform, duration, deliveries, earnings] of specs) {
    const d = new Date();
    d.setDate(d.getDate() - days);
    const s = {
      id: crypto.randomUUID(),
      date: localDate(d),
      time,
      platform,
      duration,
      deliveries,
      earnings,
      note: "",
    };
    shifts.push({ ...s, recognition: recognitionFor(s, shifts) });
  }
  return {
    profile: {
      name: "Alex Morgan",
      city: "Austin, TX",
      bio: "Independent driver. Early starts, good playlists, and a little more freedom.",
      reliability: 98,
      safety: 99,
      rating: 4.9,
      contributions: 14,
      priorDeliveries: 1139,
    },
    shifts,
  };
}
export function portableRecord(profile: Profile, shifts: Shift[]) {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    source: "FLEET",
    evidence: "Self-reported; not verified by delivery platforms.",
    profile: { ...profile },
    score: fleetScore(profile, shifts),
    shifts: shifts.map(({ note, ...rest }) => rest),
  };
}
export function weekData(shifts: Shift[], offset = 0) {
  const now = new Date();
  const start = new Date(now);
  start.setDate(now.getDate() - ((now.getDay() + 6) % 7) + offset * 7);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const date = localDate(d);
    return {
      date,
      label: d.toLocaleDateString("en-US", { weekday: "short" }),
      hours: shifts
        .filter((s) => s.date === date)
        .reduce((n, s) => n + s.duration, 0),
    };
  });
}
