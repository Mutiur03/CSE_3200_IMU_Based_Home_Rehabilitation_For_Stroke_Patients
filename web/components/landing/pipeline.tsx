// The real data path of the system, left to right. Wording matches what the code does (see server/README.md).
const STAGES = [
  {
    title: "Wristband",
    body: "An ICM-42688-P motion sensor and an ESP32, worn like a watch on the back of the wrist. It sends about 100 samples a second.",
    icon: (
      <>
        <rect x="9" y="3" width="14" height="26" rx="4" />
        <rect x="12.5" y="11" width="7" height="10" rx="1.5" />
      </>
    ),
  },
  {
    title: "Wi-Fi",
    body: "A WebSocket straight to the server. The wristband proves who it is with a device key. No Bluetooth.",
    icon: (
      <>
        <path d="M4 12a17 17 0 0 1 24 0" />
        <path d="M8.5 17a11 11 0 0 1 15 0" />
        <path d="M13 22a5 5 0 0 1 6 0" />
        <circle cx="16" cy="26" r="1.2" fill="currentColor" />
      </>
    ),
  },
  {
    title: "Server",
    body: "Checks each packet, keeps the raw signal untouched, works out forearm roll and pitch, and scores every rep.",
    icon: (
      <>
        <rect x="4" y="5" width="24" height="9" rx="2.5" />
        <rect x="4" y="18" width="24" height="9" rx="2.5" />
        <circle cx="9" cy="9.5" r="1.1" fill="currentColor" />
        <circle cx="9" cy="22.5" r="1.1" fill="currentColor" />
      </>
    ),
  },
  {
    title: "Game in the browser",
    body: "The patient steers a short game with the forearm. Each finished rep goes back to the server and the next level adapts.",
    icon: (
      <>
        <rect x="3" y="6" width="26" height="17" rx="2.5" />
        <path d="M11 27h10M16 23v4" />
        <path d="M9 17c3-6 7-6 9-2s4 1 5-2" />
      </>
    ),
  },
  {
    title: "Doctor's view",
    body: "Sessions, trends, a replay of the movement, the improvement index, marking, plan and reports.",
    icon: (
      <>
        <path d="M4 4v24h24" />
        <path d="M8 21l6-7 5 4 8-11" />
      </>
    ),
  },
];

export function Pipeline() {
  return (
    <ol className="grid gap-0 md:grid-cols-5">
      {STAGES.map((s, i) => (
        <li key={s.title} className="relative flex gap-4 pb-8 md:block md:pb-0 md:pr-6">
          {i < STAGES.length - 1 && (
            <>
              <span aria-hidden="true" className="absolute left-[1.55rem] top-14 bottom-0 w-px bg-border md:hidden" />
              <span aria-hidden="true" className="absolute left-16 right-2 top-[1.65rem] hidden h-px bg-border md:block" />
            </>
          )}
          <span className="relative z-10 flex size-[3.25rem] shrink-0 items-center justify-center rounded-full border border-border bg-card text-primary">
            <svg viewBox="0 0 32 32" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {s.icon}
            </svg>
          </span>
          <div className="md:mt-5">
            <h3 className="font-display text-[1.375rem] leading-tight">{s.title}</h3>
            <p className="mt-2 max-w-[34ch] text-[0.9375rem] leading-relaxed text-muted-foreground">{s.body}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
