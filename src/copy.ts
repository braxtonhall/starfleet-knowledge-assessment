export const copy = {
  banner: "STARFLEET KNOWLEDGE ASSESSMENT",
  bannerHop: "56844",
  floorText: "STARFLEET KNOWLEDGE NETWORK AVAILABLE",

  nav: {
    quickDrill: "QUICK DRILL",
    database: "DATABASE",
    systems: "SYSTEMS",
    endSession: "END SESSION",
  },

  landing: {
    heading: "STARFLEET KNOWLEDGE ASSESSMENT",
    sub: "RECERTIFICATION & TRAINING PROGRAM",
    solo: "SOLO SIMULATION",
    soloSub: "INDEPENDENT STUDY",
    crew: "CREW DRILL",
    crewSub: "AWAY-TEAM EXERCISE",
    crewDisabled: "DISENGAGED — AWAITING CREW",
  },

  hub: {
    heading: "SOLO SIMULATION",
    quickDrill: "QUICK DRILL",
    quickDrillSub: "STANDARD ASSESSMENT",
    database: "STARFLEET DATABASE",
    databaseSub: "REVIEW THE ARCHIVE",
    systems: "SYSTEMS",
    systemsSub: "CONFIGURATION",
  },

  config: {
    heading: "QUICK DRILL",
    count: "ASSESSMENT LENGTH",
    responseWindow: "RESPONSE WINDOW",
    responseEfficiency: "RESPONSE EFFICIENCY BONUS",
    supplementalData: "SUPPLEMENTAL DATA",
    supplementalDataSub: "DISPLAY FEATURE MATERIAL",
    disciplineFilter: "DISCIPLINE FILTER",
    engage: "ENGAGE",
    itemsAvailable: "ITEMS AVAILABLE",
    poolEmpty: "INSUFFICIENT DATA",
  },

  play: {
    progress: (position: number, total: number | null) =>
      total === null ? `ITEM ${String(position + 1).padStart(4, "0")}` : `ITEM ${String(position + 1).padStart(4, "0")} · ${position + 1} / ${total}`,
    discipline: (title: string) => `DISCIPLINE: ${title.toUpperCase()}`,
    supplementalData: "SUPPLEMENTAL DATA",
    untimed: "UNTIMED — SUPPLEMENTAL DATA",
    quit: "DISENGAGE",
    skip: "SKIP",
    proceed: "PROCEED",
    confirmed: "CONFIRMED",
    incorrect: "INCORRECT",
    timeExpired: "RESPONSE WINDOW EXPIRED",
  },

  results: {
    complete: "ASSESSMENT COMPLETE",
    efficiency: (correct: number, total: number) => `EFFICIENCY RATING: ${correct} / ${total}`,
    bonus: (points: number) => `RESPONSE EFFICIENCY: +${points}`,
    newRecord: "NEW EFFICIENCY RECORD",
    review: "ITEMS REQUIRING REVIEW",
    skipped: "NO RESPONSE LOGGED",
    return: "RETURN",
    reEngage: "RE-ENGAGE",
  },

  browse: {
    heading: "STARFLEET DATABASE",
    search: "SCAN DATABASE…",
    noMatches: "NO MATCHES FOUND",
    confirmed: (count: number) => `${count} CONFIRMED`,
    incorrect: (count: number) => `${count} INCORRECT`,
    categories: "DISCIPLINES",
    item: (number: number) => `ITEM ${String(number).padStart(4, "0")}`,
    supplemental: "SUPPLEMENTAL DATA AVAILABLE",
  },

  options: {
    heading: "SYSTEMS",
    purgeAll: "PURGE ALL RECORDS",
    purgeAllConfirm: "PURGE ALL 2,700 ITEMS — CONFIRM?",
    purgeByDiscipline: "PURGE BY DISCIPLINE",
    purge: "PURGE",
    purgeCategoryConfirm: (title: string, count: number) =>
      `PURGE ${count} LOGGED ITEMS FROM ${title.toUpperCase()} — CONFIRM?`,
    acknowledge: "ACKNOWLEDGED",
    abort: "ABORT",
    recordsCleared: "RECORDS PURGED",
  },

  detail: {
    close: "CLOSE",
    answer: "SELECT RESPONSE",
  },

  crew: {
    heading: "CREW DRILL",
    sub: "AWAY-TEAM EXERCISE",
    host: "ASSUME COMMAND",
    hostSub: "RUN THE DRILL FROM THIS TERMINAL",
    join: "REPORT ABOARD",
    joinSub: "ANSWER FROM THIS DEVICE",

    // Host lobby
    lobby: "READY ROOM",
    opening: "OPENING CHANNEL…",
    designation: "VESSEL DESIGNATION",
    designationHint: "EDIT TO REASSIGN — ENTER TO CONFIRM",
    coordinates: "TRANSPORT COORDINATES",
    scanHint: "SCAN WITH A PHONE CAMERA TO REPORT ABOARD",
    copyLink: "COPY TRANSPORT LINK",
    copied: "COORDINATES COPIED",
    copyFailed: "COPY UNAVAILABLE — READ THE CODE ALOUD",
    roster: "CREW ROSTER",
    rosterEmpty: "AWAITING CREW",
    aboard: "ABOARD",
    signalLost: "SIGNAL LOST",
    awaiting: "AWAITING",
    logged: "LOGGED",
    noResponse: "NO RESPONSE",
    crewCount: (count: number) => `${count} ABOARD`,
    needCrew: "AWAITING CREW BEFORE ENGAGING",

    // The host's seat
    hostSeat: "COMMANDING OFFICER ANSWERS",
    hostSeatHint:
      "THIS TERMINAL BECOMES A PERSONAL SCREEN — KEEP IT TO YOURSELF. STANDINGS GO TO EVERY DEVICE.",
    command: "COMMAND",

    // Host play
    responseStatus: "CREW RESPONSE STATUS",
    reveal: "REVEAL",
    correctResponse: "CORRECT RESPONSE",
    proceed: "PROCEED",
    forceReveal: "FORCE REVEAL",
    endDrill: "END DRILL",
    standings: "CUMULATIVE STANDINGS",
    commendation: (name: string) => `COMMENDATION — ${name}`,
    deadHeat: (names: string) => `DEAD HEAT — ${names}`,
    you: "YOU",
    restart: "RETURN TO READY ROOM",
    disband: "DISBAND CREW",

    // Player device
    connecting: "ESTABLISHING LINK…",
    reconnecting: "RE-ESTABLISHING LINK…",
    standBy: "STAND BY FOR THE COMMANDING OFFICER",
    youAre: (name: string) => `DESIGNATION: ${name}`,
    awaitCrew: "AWAITING CREW RESPONSE",
    responseLocked: "RESPONSE LOCKED",
    noResponseLogged: "NO RESPONSE LOGGED",
    drillComplete: "DRILL COMPLETE",
    yourRating: (correct: number, total: number) => `EFFICIENCY RATING: ${correct} / ${total}`,
    standingsOnHost: "CUMULATIVE STANDINGS ARE ON THE MAIN VIEWER",

    // Join entry
    joinHeading: "REPORT ABOARD",
    codeLabel: "VESSEL DESIGNATION",
    codePlaceholder: "ENTERPRISE-2345",
    energize: "ENERGIZE",
    scanNote: "OR SCAN THE TRANSPORT COORDINATES ON THE MAIN VIEWER",

    // Failure states
    roomMissing: "NO VESSEL ANSWERS THAT DESIGNATION",
    disbanded: "CREW DISBANDED",
    disbandedDetail: "THE COMMANDING OFFICER HAS ENDED THIS DRILL",
    roomLocked: "THE DRILL IS UNDER WAY — NO LATE ARRIVALS",
    roomFull: "CREW COMPLEMENT IS FULL",
    versionMismatch: "INCOMPATIBLE TERMINAL VERSION",
    linkLost: "LINK LOST",
    channelFailed: "UNABLE TO OPEN A CHANNEL",
    tryAgain: "RETRY",
    withdraw: "WITHDRAW",
  },

  /**
   * Duty Rotation (spec §5.11). The hook is the voice plan's own: a turn
   * hand-off in this register is "you have the conn".
   */
  rotation: {
    entry: "DUTY ROTATION",
    entrySub: "ONE TERMINAL, PASSED ALONG",
    heading: "DUTY ROTATION",

    // Config
    officers: "OFFICERS ABOARD",
    count: "ASSESSMENT LENGTH — PER OFFICER",
    /** The multiplication is never a surprise: it is on the screen that sets it. */
    draw: (officers: number, each: number, total: number) =>
      `${officers} × ${each} — ${total} ITEMS DRAWN`,
    insufficient: (total: number, available: number) =>
      `INSUFFICIENT DATA — ${total} REQUIRED, ${available} AVAILABLE`,

    // Watch bill
    watchBill: "WATCH BILL",
    watchBillHint: "TURN ORDER IS FIXED — PASS THE TERMINAL DOWN THE LIST",
    firstWatch: "FIRST WATCH",
    begin: "BEGIN ROTATION",

    // Hand-off
    conn: (name: string) => `${name} — YOU HAVE THE CONN`,
    takeConn: "TAKE THE CONN",
    progress: (rotation: number, name: string) =>
      `ROTATION ${String(rotation).padStart(2, "0")} · ${name}`,
    /** The outgoing officer's verdict, and nothing else of theirs. */
    previousResult: (name: string, verdict: string) => `${name} — ${verdict}`,

    // Standings
    tally: (correct: number, turns: number) => `${correct} / ${turns}`,
    review: (name: string, count: number) => `${name} — ${count} ITEMS`,
    reviewClean: "NO ITEMS REQUIRING REVIEW",
    again: "ROTATE AGAIN",
  },

  system: {
    accessing: "ACCESSING…",
    unableToComply: "UNABLE TO COMPLY",
  },

  authorization: {
    heading: "ENTER AUTHORIZATION CODE",
    input: "AUTHORIZATION CODE",
    submit: "AUTHORIZE",
    invalid: "AUTHORIZATION CODE REJECTED",
  },
} as const;
