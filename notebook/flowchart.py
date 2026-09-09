# -*- coding: utf-8 -*-
"""flowchart.py — draws the claim-ranking algorithm as a flowchart (matplotlib only, no Graphviz needed).
    python flowchart.py            → figures/algorithm_flowchart.png (also used by the Week 5 deck)
"""
import os
from matplotlib.figure import Figure          # no pyplot: importing this module never changes the notebook's backend
from matplotlib.patches import FancyBboxPatch, Polygon, FancyArrowPatch, Circle

NAVY, TEAL, TEAL2, TEALBG = '#1f3864', '#0f9d8f', '#0c7d72', '#e6f6f3'
INK, MUTE, LINE, BG2, RED, GOLD = '#1f2a37', '#6b7280', '#cfd4db', '#f8fafc', '#c0392b', '#b8791f'
FONT = dict(family='DejaVu Sans')


def draw(out_png: str, dpi: int = 200) -> str:
    fig = Figure(figsize=(16, 8.8)); ax = fig.add_subplot(111)
    ax.set_xlim(0, 16); ax.set_ylim(-1.15, 8.1); ax.axis('off')

    def box(x, y, w, h, title, body='', fill='white', edge=LINE, tcol=NAVY, lw=1.2, fs=8.2):
        ax.add_patch(FancyBboxPatch((x, y), w, h, boxstyle='round,pad=0.02,rounding_size=0.12', fc=fill, ec=edge, lw=lw))
        ax.text(x + w / 2, y + h - 0.22, title, ha='center', va='top', fontsize=9.6, fontweight='bold', color=tcol, **FONT)
        if body:
            ax.text(x + w / 2, y + h - 0.55, body, ha='center', va='top', fontsize=fs, color=INK, wrap=True, linespacing=1.25, **FONT)
        return (x, y, w, h)

    def diamond(cx, cy, w, h, text, fill='white', edge=NAVY):
        ax.add_patch(Polygon([(cx - w / 2, cy), (cx, cy + h / 2), (cx + w / 2, cy), (cx, cy - h / 2)], closed=True, fc=fill, ec=edge, lw=1.4))
        ax.text(cx, cy, text, ha='center', va='center', fontsize=8.6, fontweight='bold', color=NAVY, **FONT)

    def arrow(p, q, color=NAVY, label=None, lpos=0.5, style='-|>', ls='-', lw=1.4, rad=0.0, loff=(0, 0.12)):
        a = FancyArrowPatch(p, q, arrowstyle=style, mutation_scale=13, color=color, lw=lw, ls=ls, connectionstyle=f'arc3,rad={rad}')
        ax.add_patch(a)
        if label:
            x = p[0] + (q[0] - p[0]) * lpos + loff[0]; y = p[1] + (q[1] - p[1]) * lpos + loff[1]
            ax.text(x, y, label, ha='center', va='bottom', fontsize=7.8, color=color, fontweight='bold', **FONT)

    def num(x, y, n, color=NAVY):
        ax.add_patch(Circle((x, y), 0.17, fc=color, ec='white', lw=1))
        ax.text(x, y, str(n), ha='center', va='center', fontsize=8, color='white', fontweight='bold', **FONT)

    # ------------------------------------------------------------- row 1 (top, left → right): one claim comes in
    Y1 = 5.55; H = 1.55
    box(0.35, Y1, 2.3, H, 'Claim arrives', 'FHIR R4 Claim from the EMR\nor keyed in at the facility\n(HIB or SSF, any hospital)')
    num(0.42, Y1 + H + 0.02, 1)
    box(3.15, Y1, 2.75, H, 'Engine 1 · openIMIS edits', 'per claim, in isolation:\n9 dates · 21 coverage · 2 price list\n10 care type · 16 quantity\n(6 duplicate, 8 ICD: disabled)')
    num(3.22, Y1 + H + 0.02, 2)
    diamond(7.1, Y1 + H / 2, 1.5, 1.25, 'rejected?')
    box(9.05, Y1, 2.9, H, 'Identity resolution', 'National ID  →  NID:…\nelse name + DOB + sex  →  COMP:…\n(same key for HIB and SSF)', fill=TEALBG, edge=TEAL, tcol=TEAL2)
    num(9.12, Y1 + H + 0.02, 3, TEAL2)
    box(12.45, Y1, 3.2, H, 'Claim history + provider context', 'every earlier claim of this identity\n(both schemes, all facilities, incl. rejected)\n+ facility flag rate (last 100 claims)\n+ the doctor\'s recent claims (NMC no.)', fill=TEALBG, edge=TEAL, tcol=TEAL2)
    num(12.52, Y1 + H + 0.02, 4, TEAL2)

    arrow((2.65, Y1 + H / 2), (3.15, Y1 + H / 2))
    arrow((5.9, Y1 + H / 2), (6.35, Y1 + H / 2))
    arrow((7.85, Y1 + H / 2), (9.05, Y1 + H / 2), label='no · status Checked', lpos=0.5)
    arrow((11.95, Y1 + H / 2), (12.45, Y1 + H / 2))
    # rejected branch
    box(7.75, 3.6, 2.3, 1.0, 'Rejected', 'reason code stored; the claim\nstays in the history (R5 looks back)', fill=BG2, edge=RED, tcol=RED, fs=7.6)
    arrow((7.1, Y1 + H / 2 - 0.62), (8.9, 4.6), color=RED, label='yes', lpos=0.3, loff=(0.3, 0.05), rad=0.25)

    # ------------------------------------------------------------- row 2 (bottom, right → left): scoring and ranking
    Y2 = 0.95
    box(12.45, Y2, 3.2, 2.15, 'Engine 2 · the rules', 'per earlier claim:  R1 duplicate · R2 split\nR3 cross-scheme · R4 overlap · R5 resubmission\nper claim:  R8 frequency · STG protocol\nper provider:  R7 doctor · R6 facility\n→ flags, each with a weight and a "because"', fill=TEALBG, edge=TEAL, tcol=TEAL2)
    num(12.52, Y2 + 2.15 + 0.02, 5, TEAL2)
    box(9.05, Y2, 2.9, 2.15, 'Scoring', 'subsumption: R4 on the same matched\nclaim as R3 → 0 points\npoints = learned weight × confidence\n(composite identity → medium)\nsuspicion = Σ points', fill=TEALBG, edge=TEAL, tcol=TEAL2)
    num(9.12, Y2 + 2.15 + 0.02, 6, TEAL2)
    diamond(7.1, Y2 + 1.075, 1.5, 1.25, 'any flag?')
    box(3.15, Y2, 2.75, 2.15, 'Ranked review queue', 'review status Selected\nqueue sorted by suspicion, ties in\nsubmission order; budget = 5 % of\nthe book (today\'s random sample)\nrandom slice kept as a control', fill=TEALBG, edge=TEAL, tcol=TEAL2)
    num(3.22, Y2 + 2.15 + 0.02, 7, TEAL2)
    box(0.35, Y2, 2.3, 2.15, 'Reviewer decision', 'Medical Officer reads the\n"because" and the matched claim\nconfirm → reason 6, weight +0.5\nclear → weight −0.5\nrelease → pay, keep the flag\n(weights bounded 0.5 … 5)', fill=TEALBG, edge=TEAL, tcol=TEAL2, fs=7.8)
    num(0.42, Y2 + 2.15 + 0.02, 8, TEAL2)

    # from history (row 1, right) down into the rules
    arrow((14.05, Y1), (14.05, Y2 + 2.15))
    arrow((12.45, Y2 + 1.075), (11.95, Y2 + 1.075))
    arrow((9.05, Y2 + 1.075), (7.85, Y2 + 1.075))
    arrow((6.35, Y2 + 1.075), (5.9, Y2 + 1.075), label='yes', lpos=0.5)
    arrow((3.15, Y2 + 1.075), (2.65, Y2 + 1.075))
    # clean branch
    box(4.15, 3.6, 2.3, 1.0, 'Clean → payment', 'no rule fired against the person\'s\nhistory; valuated and paid', fill=BG2, edge=TEAL2, tcol=TEAL2, fs=7.6)
    arrow((7.1, Y2 + 1.075 + 0.62), (5.3, 3.6), color=TEAL2, label='no', lpos=0.25, loff=(-0.3, 0.1), rad=0.25)
    # learning loop: reviewer → back into scoring weights
    arrow((1.5, Y2), (10.5, Y2), color=GOLD, ls='--', rad=0.2, lw=1.6)
    ax.text(6.0, -0.5, 'feedback: the decision re-weights every rule that fired (confirm +0.5 · clear −0.5), so the next claim is scored with what the reviewers taught', ha='center', va='center', fontsize=7.8, color=GOLD, fontweight='bold', **FONT)
    # every processed claim is added to the history index
    ax.text(14.05, 4.62, 'the claim itself is indexed\nfor the next one', ha='left', va='center', fontsize=7.4, color=MUTE, style='italic', **FONT)

    # legend
    ax.text(0.35, -0.95, 'white = exists in openIMIS today   ·   teal = the knowledge layer this study adds   ·   dashed gold = the learning loop   ·   '
            'the same code runs in the app (Week 3-4/mvp/backend/engine) and in claim_ranking.py', fontsize=7.6, color=MUTE, **FONT)
    ax.text(0.35, 7.8, 'Ranking claim documents — the algorithm', fontsize=13, fontweight='bold', color=NAVY, va='center', **FONT)
    ax.text(0.35, 7.38, 'one claim in, a weighted and explained position in the review queue out — synthetic claim book, no real data', fontsize=8.6, color=MUTE, va='center', **FONT)

    os.makedirs(os.path.dirname(out_png), exist_ok=True)
    fig.savefig(out_png, dpi=dpi, bbox_inches='tight', facecolor='white')
    return out_png


if __name__ == '__main__':
    here = os.path.dirname(os.path.abspath(__file__))
    print(draw(os.path.join(here, 'figures', 'algorithm_flowchart.png')))
