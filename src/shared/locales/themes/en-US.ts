// Theme names (General settings) and holiday touches.
export const themesEnUS = {
  colorsGroup: "Colors",
  prideGroup: "Pride",
  names: {
    pink: "Blush pink",
    green: "Soft green",
    blue: "Mist blue",
    purple: "Lavender",
    amber: "Warm amber",
    rainbow: "Rainbow flag",
    trans: "Transgender flag",
    lesbian: "Lesbian flag",
    bi: "Bisexual flag",
    pan: "Pansexual flag",
    nonbinary: "Nonbinary flag",
    ace: "Asexual flag",
  },
  holidayTouches: "Holiday touches",
  holidayTouchesDescription:
    "Small seasonal details on well-known days: a badge by the greeting and festive status lines. Uses this device's date only.",
  holidays: {
    newYear: {
      name: "Happy New Year",
      phrases: ["Counting down…", "Popping confetti…", "Writing resolutions…"],
    },
    valentines: {
      name: "Happy Valentine's Day",
      phrases: [
        "Folding paper hearts…",
        "Writing a love note…",
        "Picking roses…",
      ],
    },
    womensDay: {
      name: "International Women's Day",
      phrases: [
        "Celebrating women…",
        "Gathering flowers…",
        "Honoring pioneers…",
      ],
    },
    transVisibility: {
      name: "Trans Day of Visibility",
      phrases: [
        "Celebrating trans joy…",
        "Raising the flag…",
        "Cheering you on…",
      ],
    },
    aprilFools: {
      name: "April Fools' Day",
      phrases: [
        "Hiding a whoopee cushion…",
        "Asking the rubber duck…",
        "Reticulating splines…",
        "Pretending to be busy…",
      ],
    },
    earthDay: {
      name: "Earth Day",
      phrases: ["Planting trees…", "Saving energy…", "Hugging a tree…"],
    },
    pride: {
      name: "Happy Pride Month",
      phrases: ["Waving the rainbow…", "Marching proudly…", "Spreading love…"],
    },
    halloween: {
      name: "Happy Halloween",
      phrases: ["Carving pumpkins…", "Brewing potions…", "Summoning answers…"],
    },
    christmas: {
      name: "Merry Christmas",
      phrases: [
        "Wrapping presents…",
        "Checking it twice…",
        "Trimming the tree…",
      ],
    },
    birthday: {
      name: "OpenBrowserAgent's birthday",
      phrases: ["Blowing out candles…", "Cutting the cake…", "Making a wish…"],
    },
  },
};

export type ThemesMessages = typeof themesEnUS;
