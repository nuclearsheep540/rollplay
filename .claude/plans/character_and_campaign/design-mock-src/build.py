#!/usr/bin/env python3
"""Assemble the campaign-builder artboards from one shared shell."""
from pathlib import Path

HERE = Path(__file__).parent
CHROME_CSS = (HERE / "_chrome.css").read_text()

DOTS = """<svg width="24" height="24" viewBox="0 0 24 24" fill="#B5ADA6"><g transform="rotate(45 12 12)">
<rect x="3.2" y="3.2" width="3.6" height="3.6"/><rect x="10.2" y="3.2" width="3.6" height="3.6"/><rect x="17.2" y="3.2" width="3.6" height="3.6"/>
<rect x="3.2" y="10.2" width="3.6" height="3.6"/><rect x="10.2" y="10.2" width="3.6" height="3.6"/><rect x="17.2" y="10.2" width="3.6" height="3.6"/>
<rect x="3.2" y="17.2" width="3.6" height="3.6"/><rect x="10.2" y="17.2" width="3.6" height="3.6"/><rect x="17.2" y="17.2" width="3.6" height="3.6"/></g></svg>"""

PLUS = """<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M8 3v10M3 8h10"/></svg>"""
TRASH = """<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M3 4.5h10M6.5 4.5V3h3v1.5M5 4.5l.6 8h4.8l.6-8"/></svg>"""
GRIP = """<svg width="14" height="16" viewBox="0 0 14 16" fill="#B5ADA6"><circle cx="4" cy="3" r="1.4"/><circle cx="10" cy="3" r="1.4"/><circle cx="4" cy="8" r="1.4"/><circle cx="10" cy="8" r="1.4"/><circle cx="4" cy="13" r="1.4"/><circle cx="10" cy="13" r="1.4"/></svg>"""


def header(right_slot: str) -> str:
    return f"""
<div style="height: 64px; box-sizing: border-box; background: #1F1F1F; border-bottom: 1px solid #37322F40; padding: 0 40px; display: flex; align-items: center; justify-content: space-between;">
  <div style="display: flex; align-items: center; gap: 14px;">
    <div style="width: 32px; height: 32px; border-radius: 6px; background: #37322F; display: flex; align-items: center; justify-content: center; color: #D9A441;" class="display">T</div>
    <div class="display" style="color: #F7F4F3; font-size: 18px;">Tabletop Tavern</div>
  </div>
  <div style="display: flex; align-items: center; gap: 28px;">
    {right_slot}
    <div style="height: 36px; display: inline-flex; align-items: stretch; border-radius: 8px; overflow: hidden; background: #37322F;">
      <div style="width: 36px; background: #B5ADA6;"></div>
      <div style="display: flex; align-items: center; padding: 0 12px; color: #F7F4F3; font-size: 14px;">Matt</div>
    </div>
    <div style="height: 36px; width: 32px; display: flex; align-items: center;">{DOTS}</div>
  </div>
</div>"""


def left_nav(active: str) -> str:
    """Narrow dark rail. Three tall parallelogram tabs with labels reading bottom to top."""
    tabs = []
    for name in ("Overview", "World", "Character"):
        cls = "plate-gold" if name == active else "plate-outline"
        tabs.append(
            f'<div class="{cls}" style="width: 52px; height: 168px; border-radius: 8px; transform: skewY(-8deg); '
            f'display: flex; align-items: center; justify-content: center;">'
            f'<span style="display: inline-block; transform: skewY(8deg) rotate(-90deg); white-space: nowrap; '
            f'font-size: 13px; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase;">{name}</span></div>'
        )
    tabs_html = "\n    ".join(tabs)
    return f"""
<div style="width: 92px; box-sizing: border-box; background: #1F1F1F; padding: 36px 20px 24px 20px; display: flex; flex-direction: column; gap: 22px; flex-shrink: 0; align-items: center;">
    {tabs_html}
</div>"""


def campaign_band(campaign_title: str, version_line: str) -> str:
    return f"""
<div style="height: 96px; box-sizing: border-box; background: #F7F4F3; border-bottom: 1px solid #E5DECF; padding: 0 40px; display: flex; align-items: center; justify-content: space-between; gap: 24px;">
  <div style="display: flex; flex-direction: column; gap: 6px;">
    <div class="eyebrow">Campaign</div>
    <div style="display: flex; align-items: center; gap: 14px;">
      <div class="display" style="color: #0B0A09; font-size: 26px; line-height: 1.1;">{campaign_title}</div>
      <span class="chip skew" style="border-color: #37322F; color: #37322F;"><span class="unskew">Draft</span></span>
      <span class="version skew"><span class="unskew">{version_line}</span></span>
      <span class="hint">unsaved changes</span>
    </div>
  </div>
  <div style="display: flex; align-items: center; gap: 10px;">
    <div class="btn btn-sm skew plate-light"><span class="unskew">Back to campaigns</span></div>
    <div class="btn skew plate-gold"><span class="unskew">Save campaign</span></div>
  </div>
</div>"""


def subtabs(items: list[tuple[str, bool]]) -> str:
    parts = []
    for label, on in items:
        cls = "subtab skew subtab-active" if on else "subtab skew"
        parts.append(f'<div class="{cls}"><span class="unskew">{label}</span></div>')
    return f"""
<div style="height: 44px; box-sizing: border-box; background: #B5ADA6; border-bottom: 1px solid #37322F; padding: 0 28px; display: flex; align-items: center; gap: 6px;">
  {"".join(parts)}
</div>"""


def page(title: str, active: str, campaign_title: str, version_line: str, tabs: list[tuple[str, bool]], body: str, header_right: str = "") -> str:
    return f"""<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  <title>{title}</title>
  <style>
{CHROME_CSS}
  </style>
</helmet>
<div style="width: 1440px; min-height: 900px; background: #F7F4F3; display: flex; flex-direction: column;">
  {header(header_right)}
  <div style="display: flex; flex-grow: 1; min-height: 836px;">
    {left_nav(active)}
    <div style="flex-grow: 1; display: flex; flex-direction: column; min-width: 0;">
      {campaign_band(campaign_title, version_line)}
      {subtabs(tabs)}
      <div style="padding: 36px 40px 56px 40px;">
{body}
      </div>
    </div>
  </div>
</div>
</x-dc>
</body>
</html>
"""


# ---------------------------------------------------------------- Overview
OVERVIEW_BODY = """
<div style="display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 26px; align-items: start;">

  <div style="display: flex; flex-direction: column; gap: 26px;">

    <div style="position: relative; min-height: 220px; border-radius: 6px; overflow: hidden; background: radial-gradient(120% 90% at 78% 8%, #6B4A2E 0%, rgba(107,74,46,0) 34%), radial-gradient(90% 70% at 85% 30%, #24344F 0%, rgba(36,52,79,0) 55%), linear-gradient(115deg,#0A0D16 20%,#131B2E 55%,#0C1020 100%); clip-path: polygon(0 0, 100% 0, calc(100% - 41px) calc(100% - 5px), calc(100% - 43px) calc(100% - 1px), calc(100% - 47px) 100%, 0 100%);">
      <div style="padding: 36px 42px 32px 42px; display: flex; flex-direction: column; gap: 14px;">
        <input class="input display" value="Secret to Bear" style="background: transparent; border: none; border-bottom: 1px dashed rgba(247,244,243,0.35); color: #F7F4F3; font-size: 44px; line-height: 1.1; padding: 0 0 6px 0; border-radius: 0; text-shadow: 0 2px 10px rgba(5,4,3,.85);">
        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
          <span class="chip skew" style="border-color: rgba(247,244,243,0.4); color: #F7F4F3;"><span class="unskew">Mysterious</span></span>
          <span class="chip skew" style="border-color: rgba(247,244,243,0.4); color: #F7F4F3;"><span class="unskew">Investigation</span></span>
          <span class="chip skew" style="border-color: rgba(247,244,243,0.4); color: #F7F4F3;"><span class="unskew">Cosy tavern</span></span>
          <span class="chip skew" style="border-color: rgba(217,164,65,0.6); color: #D9A441;"><span class="unskew">+ tag</span></span>
        </div>
        <textarea class="input" rows="5" style="background: rgba(247,244,243,0.06); border: 1px dashed rgba(247,244,243,0.3); color: #CFC9C2; font-size: 14.5px; line-height: 1.6; resize: none;">The party experience a shocking wake-up call when an innkeeper tells them that the horses they arrived on were killed in the night. With all the signs pointing to the killer being one of their fellow guests, can the party find the culprit before anyone else gets hurt?</textarea>
      </div>
    </div>

    <div class="parchment" style="padding: 26px 28px;">
      <div class="eyebrow" style="margin-bottom: 10px;">Starting the adventure</div>
      <textarea class="input" rows="7" style="background: transparent; border: 1px dashed #E5DECF; color: #4C463E; font-size: 14.5px; line-height: 1.65; font-style: italic; resize: none;">"This far north the days are short and the nights are long, so you were grateful to have found a welcoming spot to rest when you arrived at this inn yesterday. You stabled your horses, shared a hearty meal with the other guests and headed up to bed. Undisturbed by the howling winds outside, you all slept deeply, until woken by a frantic knocking at your door."</textarea>
      <div class="hint" style="margin-top: 10px;">Read aloud to open the first game. Optional.</div>
    </div>

    <div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 26px;">
      <div class="parchment" style="padding: 24px 26px; display: flex; flex-direction: column; gap: 14px;">
        <div class="eyebrow">Important characters</div>
        <div style="display: flex; flex-direction: column; gap: 12px;">
          <div style="display: flex; gap: 12px; align-items: flex-start;">
            <div style="width: 44px; height: 44px; flex-shrink: 0; background: #37322F; clip-path: polygon(0 0, 100% 0, 80% 100%, 0 100%);"></div>
            <div>
              <div style="font-weight: 600; font-size: 14px; color: #141210;">Fealla Davey</div>
              <div class="hint">Busy Fealla runs the inn by herself. She apologises profusely for the death of the party's mounts.</div>
            </div>
          </div>
          <div style="display: flex; gap: 12px; align-items: flex-start;">
            <div style="width: 44px; height: 44px; flex-shrink: 0; background: #37322F; clip-path: polygon(0 0, 100% 0, 80% 100%, 0 100%);"></div>
            <div>
              <div style="font-weight: 600; font-size: 14px; color: #141210;">Sandon Terez</div>
              <div class="hint">Knows nothing of his own transformations, only going to sleep and waking up in his own bed.</div>
            </div>
          </div>
        </div>
        <div class="btn btn-sm skew plate-light" style="align-self: flex-start;"><span class="unskew">+ Add character</span></div>
      </div>
      <div class="parchment" style="padding: 24px 26px; display: flex; flex-direction: column; gap: 14px;">
        <div class="eyebrow">Key locations</div>
        <div style="display: flex; flex-direction: column; gap: 12px;">
          <div>
            <div style="font-weight: 600; font-size: 14px; color: #141210;">The Happy Raven Inn</div>
            <div class="hint">The inn's decor shows signs of age, but its rooms are warm, dry and clean.</div>
          </div>
          <div>
            <div style="font-weight: 600; font-size: 14px; color: #141210;">Stables</div>
            <div class="hint">Yesterday the party secured their mounts in this sturdy shed. Now five biting swarms are feasting on the horses' bodies.</div>
          </div>
        </div>
        <div class="btn btn-sm skew plate-light" style="align-self: flex-start;"><span class="unskew">+ Add location</span></div>
      </div>
    </div>

    <div class="parchment" style="padding: 24px 26px; border-style: dashed; display: flex; flex-direction: column; gap: 12px;">
      <div class="eyebrow">Secrets and clues</div>
      <div class="hint" style="color: #4C463E;">GM-only. Never shown to players.</div>
      <ol style="margin: 0; padding-left: 20px; color: #4C463E; font-size: 13.5px; line-height: 1.6; display: flex; flex-direction: column; gap: 6px;">
        <li>Fealla's business is struggling, suggesting she could have killed the horses to make the party stay longer.</li>
        <li>Dirk runs local tours focused on tales of cryptids, so could have killed the horses to drum up publicity.</li>
        <li>Sandon is a crime writer who lives alone in a cabin. The killings match a scene described in his journal.</li>
      </ol>
      <div class="btn btn-sm skew plate-light" style="align-self: flex-start;"><span class="unskew">+ Add secret</span></div>
    </div>

    <div class="card" style="padding: 24px 26px; display: flex; flex-direction: column; gap: 18px;">
      <div class="eyebrow">The table</div>
      <div style="display: grid; grid-template-columns: 220px 1fr; gap: 26px; align-items: start;">
        <div>
          <label class="label">Seats at the table</label>
          <select class="input"><option>6</option></select>
          <div class="hint" style="margin-top: 6px;">Applies the next time the game starts.</div>
        </div>
        <div>
          <label class="label">Tile background</label>
          <div style="display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px;">
            <div style="aspect-ratio: 16/9; border-radius: 2px; border: 2px solid #0B0A09; background: linear-gradient(115deg,#0A0D16,#131B2E);"></div>
            <div style="aspect-ratio: 16/9; border-radius: 2px; border: 2px solid #37322F; background: linear-gradient(115deg,#17100A,#2B1C0E);"></div>
            <div style="aspect-ratio: 16/9; border-radius: 2px; border: 2px solid #37322F; background: linear-gradient(115deg,#2A2E1A,#4A4E2E);"></div>
            <div style="aspect-ratio: 16/9; border-radius: 2px; border: 2px dashed #B5ADA6; display: flex; align-items: center; justify-content: center; color: #6B655E; font-size: 12px;">From library</div>
          </div>
        </div>
      </div>
    </div>

    <div class="card" style="padding: 24px 26px; display: flex; flex-direction: column; gap: 12px;">
      <div class="eyebrow">Ruleset</div>
      <div style="font-size: 13.5px; color: #4C463E; line-height: 1.5;">Characters in this campaign are built from the components you configure under <strong>Character</strong>.</div>
      <div style="display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; border-radius: 6px; background: #F6F1E6; border: 1px solid #E5DECF;">
        <div>
          <div style="font-size: 13px; font-weight: 600; color: #141210;">Framework preset</div>
          <div class="hint">None. Start from scratch.</div>
        </div>
        <div class="btn btn-sm skew plate-light"><span class="unskew">Choose</span></div>
      </div>
    </div>

  </div>

  <div>
    <div style="position: sticky; top: 24px; display: flex; flex-direction: column; gap: 4px; padding: 6px 0 0 18px; border-left: 1px solid #E5DECF;">
      <div class="eyebrow" style="margin-bottom: 10px;">On this page</div>
      <div style="font-size: 13.5px; font-weight: 600; color: #0B0A09; padding: 6px 0;">Story</div>
      <div style="font-size: 13.5px; color: #4C463E; padding: 6px 0;">Starting the adventure</div>
      <div style="font-size: 13.5px; color: #4C463E; padding: 6px 0;">Important characters</div>
      <div style="font-size: 13.5px; color: #4C463E; padding: 6px 0;">Key locations</div>
      <div style="font-size: 13.5px; color: #4C463E; padding: 6px 0;">Secrets and clues</div>
      <div style="font-size: 13.5px; color: #4C463E; padding: 6px 0;">The table</div>
      <div style="font-size: 13.5px; color: #4C463E; padding: 6px 0;">Ruleset</div>
    </div>
  </div>
</div>
"""

# ---------------------------------------------------------------- World
WORLD_BODY = """
<div style="display: flex; flex-direction: column; gap: 26px; max-width: 1040px;">
  <div class="card" style="padding: 26px 28px; border-style: dashed; display: flex; align-items: center; justify-content: space-between; gap: 24px;">
    <div>
      <div class="eyebrow" style="margin-bottom: 8px;">World</div>
      <div class="display" style="font-size: 22px; color: #0B0A09; margin-bottom: 6px;">Reference tables for your world</div>
      <div class="hint" style="max-width: 560px;">Travel pace, mounts, prices, light sources. Whatever your table needs to look up mid-game. Display-only, never enforced. Not part of the first release.</div>
    </div>
    <span class="version skew"><span class="unskew">Not in v1</span></span>
  </div>

  <div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 26px; opacity: 0.55;">
    <div class="parchment" style="padding: 22px 24px;">
      <div class="eyebrow" style="margin-bottom: 12px;">Travel pace</div>
      <table class="ref">
        <tr><th>Pace</th><th>Per day</th><th>Effect</th></tr>
        <tr><td>Hurried</td><td>Far</td><td>Harder to notice things</td></tr>
        <tr><td>Steady</td><td>Usual</td><td>-</td></tr>
        <tr><td>Careful</td><td>Short</td><td>Able to move quietly</td></tr>
      </table>
    </div>
    <div class="parchment" style="padding: 22px 24px;">
      <div class="eyebrow" style="margin-bottom: 12px;">Mounts</div>
      <table class="ref">
        <tr><th>Mount</th><th>Cost</th><th>Pace</th></tr>
        <tr><td>Riding horse</td><td>Dear</td><td>Fast</td></tr>
        <tr><td>Horse and cart</td><td>Dear</td><td>Steady</td></tr>
        <tr><td>Rowboat</td><td>Modest</td><td>Slow on water</td></tr>
      </table>
    </div>
  </div>
  <div class="btn btn-sm skew plate-light" style="align-self: flex-start; opacity: 0.55;"><span class="unskew">+ Add table</span></div>
</div>
"""

# ---------------------------------------------------------------- Character (GM config)
def component_card(kind: str, label: str, body: str, badge: str = "") -> str:
    badge_html = f'<span class="version skew" style="background: #37322F; color: #F7F4F3;"><span class="unskew">{badge}</span></span>' if badge else ""
    return f"""
<div class="card" style="display: flex; gap: 0; overflow: hidden;">
  <div style="width: 36px; background: #F6F1E6; border-right: 1px solid #E5DECF; display: flex; align-items: center; justify-content: center;">{GRIP}</div>
  <div style="flex-grow: 1; padding: 20px 24px; display: flex; flex-direction: column; gap: 16px;">
    <div style="display: flex; align-items: center; justify-content: space-between; gap: 16px;">
      <div style="display: flex; align-items: center; gap: 12px;">
        <span class="chip skew" style="background: #1F1F1F; color: #F7F4F3; border-color: #1F1F1F;"><span class="unskew">{kind}</span></span>
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 11px; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; color: #6B655E;">Label</span>
          <input class="input" value="{label}" style="width: 240px; font-weight: 600; font-size: 15px;">
        </div>
        {badge_html}
      </div>
      <div style="display: flex; align-items: center; gap: 16px; color: #6B655E;">
        <label style="display: flex; align-items: center; gap: 6px; font-size: 12.5px; color: #37322F;"><input type="checkbox"> Secret</label>
        {TRASH}
      </div>
    </div>
    {body}
  </div>
</div>"""


HP_INT_BODY = """
<div style="display: grid; grid-template-columns: 200px repeat(3, 140px); gap: 16px; align-items: end;">
  <div>
    <label class="label">Representation</label>
    <select class="input"><option>Number</option></select>
  </div>
  <div><label class="label">Minimum</label><input class="input" value="0"></div>
  <div><label class="label">Maximum</label><input class="input" value="20"></div>
  <div><label class="label">Starting value</label><input class="input" value="10"></div>
</div>
<div class="hint">A number between minimum and maximum. Reaching the minimum is the zero point.</div>
"""

HP_WEIGHTED_BODY = """
<div style="display: grid; grid-template-columns: 200px 1fr; gap: 16px; align-items: start;">
  <div style="display: flex; flex-direction: column; gap: 16px;">
    <div>
      <label class="label">Representation</label>
      <select class="input"><option>Weighted scale</option></select>
    </div>
    <div>
      <label class="label">Starting step</label>
      <select class="input"><option>Full</option></select>
    </div>
  </div>
  <div>
    <label class="label">Scale, best to worst</label>
    <div style="display: flex; flex-direction: column; gap: 6px;">
      <div style="display: grid; grid-template-columns: 80px 1fr 28px; gap: 8px; align-items: center;"><input class="input" value="1.0"><input class="input" value="Full"><span style="color: #6B655E;">{TRASH}</span></div>
      <div style="display: grid; grid-template-columns: 80px 1fr 28px; gap: 8px; align-items: center;"><input class="input" value="0.8"><input class="input" value="High"><span style="color: #6B655E;">{TRASH}</span></div>
      <div style="display: grid; grid-template-columns: 80px 1fr 28px; gap: 8px; align-items: center;"><input class="input" value="0.6"><input class="input" value="Mid"><span style="color: #6B655E;">{TRASH}</span></div>
      <div style="display: grid; grid-template-columns: 80px 1fr 28px; gap: 8px; align-items: center;"><input class="input" value="0.3"><input class="input" value="Low"><span style="color: #6B655E;">{TRASH}</span></div>
      <div style="display: grid; grid-template-columns: 80px 1fr 28px; gap: 8px; align-items: center;"><input class="input" value="0.0"><input class="input" value="Zero"><span style="color: #6B655E;">{TRASH}</span></div>
      <div class="btn btn-sm skew plate-light" style="align-self: flex-start; margin-top: 4px;"><span class="unskew">+ Add step</span></div>
    </div>
  </div>
</div>
<div class="hint">An ordered scale. Damage moves a character down it. The last step is the zero point.</div>
""".replace("{TRASH}", TRASH)

NAME_BODY = """
<div style="display: grid; grid-template-columns: 200px 140px; gap: 16px; align-items: end;">
  <div><label class="label">Maximum length</label><input class="input" value="60"></div>
  <div style="display: flex; align-items: center; gap: 8px; padding-bottom: 10px;"><input type="checkbox" checked><span style="font-size: 13px; color: #37322F;">Required</span></div>
</div>
"""

ATTR_BODY = """
<div style="display: grid; grid-template-columns: repeat(3, 140px); gap: 16px; align-items: end;">
  <div><label class="label">Minimum</label><input class="input" value="1"></div>
  <div><label class="label">Maximum</label><input class="input" value="20"></div>
  <div><label class="label">Default</label><input class="input" value="10"></div>
</div>
"""

CHARACTER_BODY = f"""
<div style="display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 26px; align-items: start;">

  <div style="display: flex; flex-direction: column; gap: 18px;">
    <div style="display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; margin-bottom: 6px;">
      <div>
        <div class="eyebrow" style="margin-bottom: 8px;">Character config</div>
        <div class="display" style="font-size: 28px; color: #0B0A09;">What a character is made of</div>
        <div class="hint" style="margin-top: 6px; max-width: 620px;">Players build against this when they take a seat. Order here is the order they see. Nothing is required except what you mark required.</div>
      </div>
    </div>

    {component_card("Name", "Name", NAME_BODY)}
    {component_card("Hit points", "Vitality", HP_INT_BODY)}
    {component_card("Hit points", "Resolve", HP_WEIGHTED_BODY)}
    {component_card("Attribute", "Strength", ATTR_BODY)}
    {component_card("Attribute", "Agility", ATTR_BODY)}
    {component_card("Attribute", "Wits", ATTR_BODY)}

    <div class="card" style="border-style: dashed; padding: 22px 24px; display: flex; align-items: center; justify-content: center; gap: 10px; color: #6B655E; font-size: 13.5px;">
      {PLUS} Drop a component here, or pick one from the palette
    </div>
  </div>

  <div style="display: flex; flex-direction: column; gap: 26px; position: sticky; top: 24px;">
    <div style="background: #1F1F1F; border-radius: 6px; padding: 22px 22px 24px 22px; display: flex; flex-direction: column; gap: 14px;">
      <div class="eyebrow" style="color: #D9A441;">Components</div>
      <div class="hint" style="color: #B5ADA6;">Ours to define, yours to configure. Add as many of each as your game needs, or none. Secret components are seen only by their player and the GM.</div>
      <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 4px;">
        <div class="skew plate-outline" style="border-radius: 6px; padding: 12px 16px; display: flex; align-items: center; justify-content: space-between;"><span class="unskew" style="font-size: 13px; font-weight: 600; color: #F7F4F3;">Name</span><span class="unskew" style="color: #D9A441;">{PLUS}</span></div>
        <div class="skew plate-outline" style="border-radius: 6px; padding: 12px 16px; display: flex; align-items: center; justify-content: space-between;"><span class="unskew" style="font-size: 13px; font-weight: 600; color: #F7F4F3;">Hit points</span><span class="unskew" style="color: #D9A441;">{PLUS}</span></div>
        <div class="skew plate-outline" style="border-radius: 6px; padding: 12px 16px; display: flex; align-items: center; justify-content: space-between;"><span class="unskew" style="font-size: 13px; font-weight: 600; color: #F7F4F3;">Attribute</span><span class="unskew" style="color: #D9A441;">{PLUS}</span></div>
      </div>
      <div class="hint" style="color: #B5ADA6; margin-top: 6px;">Number, Text and Choice arrive with the framework preset.</div>
    </div>

  </div>
</div>
"""

# ---------------------------------------------------------------- Player create flow
CREATE_BODY = """
<div style="max-width: 760px; margin: 0 auto; display: flex; flex-direction: column; gap: 26px;">

  <div style="position: relative; border-radius: 6px; overflow: hidden; background: radial-gradient(120% 90% at 78% 8%, #6B4A2E 0%, rgba(107,74,46,0) 34%), radial-gradient(90% 70% at 85% 30%, #24344F 0%, rgba(36,52,79,0) 55%), linear-gradient(115deg,#0A0D16 20%,#131B2E 55%,#0C1020 100%); clip-path: polygon(0 0, 100% 0, calc(100% - 41px) calc(100% - 5px), calc(100% - 43px) calc(100% - 1px), calc(100% - 47px) 100%, 0 100%); padding: 32px 42px 30px 42px; display: flex; flex-direction: column; gap: 10px;">
    <div class="eyebrow" style="color: #D9A441;">Take a seat</div>
    <div class="display" style="color: #F7F4F3; font-size: 36px; line-height: 1.1; text-shadow: 0 2px 10px rgba(5,4,3,.85);">Secret to Bear</div>
    <div style="display: flex; align-items: center; gap: 10px; color: #CFC9C2; font-size: 13.5px;">
      <span>Built against</span><span class="version skew"><span class="unskew">v1.0.0</span></span><span>run by Matt</span>
    </div>
  </div>

  <div class="card" style="padding: 26px 28px; display: flex; flex-direction: column; gap: 22px;">

    <div>
      <label class="label">Name <span style="color: #9A7526;">required</span></label>
      <input class="input" value="Brannoc Vell" style="font-size: 16px;">
    </div>

    <div style="height: 1px; background: #E5DECF;"></div>

    <div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 22px;">
      <div>
        <label class="label">Vitality</label>
        <div style="display: flex; align-items: center; gap: 12px;">
          <input class="input" value="10" style="width: 90px; text-align: center; font-size: 18px; font-weight: 600;">
          <div class="hint">0 to 20. Starts at 10.</div>
        </div>
      </div>
      <div>
        <label class="label">Resolve</label>
        <div style="display: flex; gap: 6px; flex-wrap: wrap;">
          <span class="chip skew plate-gold" style="border-color: #D9A441;"><span class="unskew">Full</span></span>
          <span class="chip skew"><span class="unskew">High</span></span>
          <span class="chip skew"><span class="unskew">Mid</span></span>
          <span class="chip skew"><span class="unskew">Low</span></span>
          <span class="chip skew"><span class="unskew">Zero</span></span>
        </div>
        <div class="hint" style="margin-top: 8px;">Starts at Full.</div>
      </div>
    </div>

    <div style="height: 1px; background: #E5DECF;"></div>

    <div>
      <div class="eyebrow" style="margin-bottom: 12px;">Attributes</div>
      <div style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px;">
        <div class="parchment" style="padding: 14px 16px; display: flex; flex-direction: column; gap: 8px;">
          <div style="font-weight: 600; font-size: 13.5px; color: #141210;">Strength</div>
          <input class="input" value="14" style="text-align: center; font-size: 18px; font-weight: 600;">
          <div class="hint">1 to 20, default 10</div>
        </div>
        <div class="parchment" style="padding: 14px 16px; display: flex; flex-direction: column; gap: 8px;">
          <div style="font-weight: 600; font-size: 13.5px; color: #141210;">Agility</div>
          <input class="input" value="10" style="text-align: center; font-size: 18px; font-weight: 600;">
          <div class="hint">1 to 20, default 10</div>
        </div>
        <div class="parchment" style="padding: 14px 16px; display: flex; flex-direction: column; gap: 8px;">
          <div style="font-weight: 600; font-size: 13.5px; color: #141210;">Wits</div>
          <input class="input" value="8" style="text-align: center; font-size: 18px; font-weight: 600;">
          <div class="hint">1 to 20, default 10</div>
        </div>
      </div>
    </div>

    <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 6px;">
      <div class="hint">Nothing here is checked against a rulebook. Your table decides what is fair.</div>
      <div class="btn skew plate-gold"><span class="unskew">Take a seat</span></div>
    </div>
  </div>
</div>
"""


def create_page() -> str:
    """Player-facing flow: no left nav, plain authenticated shell."""
    return f"""<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  <title>Character create flow</title>
  <style>
{CHROME_CSS}
  </style>
</helmet>
<div style="width: 1440px; min-height: 900px; background: #F7F4F3; display: flex; flex-direction: column;">
  {header("")}
  <div style="padding: 40px 40px 64px 40px;">
{CREATE_BODY}
  </div>
</div>
</x-dc>
</body>
</html>
"""


def main() -> None:
    title = "Secret to Bear"
    (HERE / "Main.dc.html").write_text(page(
        "Campaign · Overview", "Overview", title, "v1.0.0",
        [("Story", True), ("Setup", False)], OVERVIEW_BODY))
    (HERE / "World.dc.html").write_text(page(
        "Campaign · World", "World", title, "v1.0.0",
        [("Tables", True), ("Reference", False)], WORLD_BODY))
    (HERE / "Character.dc.html").write_text(page(
        "Campaign · Character", "Character", title, "v1.0.0",
        [("Components", True), ("Versions", False)], CHARACTER_BODY))
    (HERE / "CharacterCreate.dc.html").write_text(create_page())
    print("wrote 4 artboards")


if __name__ == "__main__":
    main()
