#!/usr/bin/env node
// Render the gig-update email to /tmp/gigwright-email-preview.html with
// realistic mock data so we can eyeball the design without sending a real
// email through Resend. Run: `node scripts/preview-email.mjs` (or with
// `--scenario greeting | update | minimal | full`).
//
// We import the compiled TS source via tsx so we don't have to maintain a
// duplicated copy of renderHtml.

import { renderHtml } from "../lib/email-render";
import { writeFileSync } from "node:fs";

const scenarios = {
  full: {
    firstName: "patrick",
    bandleader: "Patrick Lamb",
    triggerLabel: "Greetings",
    message:
      "Still working on my app getting a few things dialed. Let me know that you received this — can't wait to see you!\n\nPatrick",
    gigId: "demo123",
    venueName: "Coaster Theatre Playhouse",
    venueAddress: "108 North Hemlock Street, Cannon Beach, OR 97110",
    mapLink: "https://maps.google.com/?q=108+N+Hemlock+St+Cannon+Beach",
    longDate: "Sunday, May 17",
    loadIn: "11:00 AM",
    soundcheck: "12:00 PM",
    soundcheckEnd: "1:30 PM",
    call: "2:45 PM",
    downbeat: "3:00 PM",
    finish: "5:30 PM",
    attire: "Upscale performance",
    loadingInfo:
      "Enter through the alley on the south side of the building — service door past the dumpsters. Joe the house engineer will let you in. Parking on the street is fine after 10am.",
    loadingMapLink: "https://maps.app.goo.gl/abc123",
    setlistUrl: "https://example.com/setlist.pdf",
    setlistFileName: "CoasterPlayhouse-2026-05-17.pdf",
    materialsUrl: "https://drive.google.com/drive/folders/abc123",
    notes:
      "Rooms have been reserved for those of you who have confirmed. Please double-confirm via email with me.",
    lineup: [
      { name: "Patrick Lamb", role: "Sax / Leader", isLeader: true },
      { name: "Dave Captein", role: "Bass", isLeader: false },
      { name: "Eero Spence", role: "Drums", isLeader: false },
      { name: "Camillo Loerakker", role: "Keys", isLeader: false },
    ],
  },
  update: {
    firstName: "dave",
    bandleader: "Patrick Lamb",
    triggerLabel: "Downbeat change",
    message:
      "Heads up — the venue moved downbeat from 7:30 to 8:00. Call still 6:00 PM. Sound check window stays the same. See you there.",
    gigId: "demo456",
    venueName: "The Funky Biscuit",
    venueAddress: "303 SE Mizner Blvd, Boca Raton, FL 33432",
    mapLink: "https://maps.google.com/?q=The+Funky+Biscuit+Boca+Raton",
    longDate: "Saturday, April 18",
    loadIn: "5:00 PM",
    soundcheck: "5:30 PM",
    soundcheckEnd: "6:30 PM",
    call: "6:00 PM",
    downbeat: "8:00 PM",
    finish: "11:00 PM",
    attire: "Black on black",
    loadingInfo: null,
    loadingMapLink: null,
    setlistUrl: null,
    setlistFileName: null,
    materialsUrl: null,
    notes: null,
    lineup: [
      { name: "Patrick Lamb", role: null, isLeader: true },
      { name: "Dave Captein", role: "Bass", isLeader: false },
      { name: "Eero Spence", role: "Drums", isLeader: false },
    ],
  },
  greeting: {
    firstName: "eero",
    bandleader: "Patrick Lamb",
    triggerLabel: "Greetings",
    message:
      "Just a heads up — set list goes up tomorrow morning. Same lineup as last month. Let me know if anything changes on your end.",
    gigId: "demo789",
    venueName: "Neumos",
    venueAddress: "925 E Pike St, Seattle, WA 98122",
    mapLink: "https://maps.google.com/?q=Neumos+Seattle",
    longDate: "Friday, March 6",
    loadIn: "6:30 PM",
    soundcheck: "7:00 PM",
    soundcheckEnd: null,
    call: "8:30 PM",
    downbeat: "9:00 PM",
    finish: "1:00 AM",
    attire: null,
    loadingInfo: null,
    loadingMapLink: null,
    setlistUrl: null,
    setlistFileName: null,
    materialsUrl: null,
    notes: null,
    lineup: [
      { name: "Patrick Lamb", role: null, isLeader: true },
      { name: "Eero Spence", role: "Drums", isLeader: false },
    ],
  },
  minimal: {
    firstName: "camillo",
    bandleader: "Patrick Lamb",
    triggerLabel: undefined,
    message: undefined,
    gigId: "demoabc",
    venueName: "St. Ignatius Catholic Church",
    venueAddress: "",
    mapLink: null,
    longDate: "Sunday, December 7",
    loadIn: null,
    soundcheck: null,
    soundcheckEnd: null,
    call: null,
    downbeat: "3:00 PM",
    finish: null,
    attire: null,
    loadingInfo: null,
    loadingMapLink: null,
    setlistUrl: null,
    setlistFileName: null,
    materialsUrl: null,
    notes: null,
    lineup: [{ name: "Patrick Lamb", role: null, isLeader: true }],
  },
};

const scenarioName = (process.argv[2]?.replace(/^--scenario=?/, "") ||
  "full") as keyof typeof scenarios;
const ctx = scenarios[scenarioName];
if (!ctx) {
  console.error(
    `Unknown scenario "${scenarioName}". Pick one of: ${Object.keys(scenarios).join(", ")}`,
  );
  process.exit(1);
}

const html = renderHtml(ctx);
const out = `/tmp/gigwright-email-preview-${scenarioName}.html`;
writeFileSync(out, html, "utf8");
console.log(`Rendered ${scenarioName} scenario → file://${out}`);
console.log(`(${html.length} bytes)`);
