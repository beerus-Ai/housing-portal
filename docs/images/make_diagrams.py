"""Draws the role and process diagrams used in docs/user-stories.md and docs/requirements.md.
Run: python docs/images/make_diagrams.py  (needs matplotlib). Output: PNGs next to this file."""
import os
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch

OUT = os.path.dirname(os.path.abspath(__file__))
DARK, ACC, LIGHT, TEXT, MUTED, PINK = '#0a303e', '#0e86b4', '#e6f6fc', '#1b2a33', '#5b6b75', '#d6336c'
plt.rcParams['font.family'] = 'DejaVu Sans'


def box(ax, x, y, w, h, title, lines=(), fill=LIGHT, edge=ACC, tcol=TEXT, size=11):
    ax.add_patch(FancyBboxPatch((x, y), w, h, boxstyle='round,pad=0.02,rounding_size=0.12', fc=fill, ec=edge, lw=1.6))
    ax.text(x + w / 2, y + h - 0.22, title, ha='center', va='top', fontsize=size, weight='bold', color=tcol)
    for i, l in enumerate(lines):
        ax.text(x + 0.15, y + h - 0.62 - i * 0.3, '- ' + l, ha='left', va='top', fontsize=8.6, color=tcol)


def arrow(ax, a, b, text='', col=ACC, rad=0.0):
    ax.add_patch(FancyArrowPatch(a, b, arrowstyle='-|>', mutation_scale=14, lw=1.6, color=col, connectionstyle=f'arc3,rad={rad}'))
    if text:
        ax.text((a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 0.12, text, ha='center', va='bottom', fontsize=8.2, color=MUTED, style='italic')


def canvas(w, h):
    fig, ax = plt.subplots(figsize=(w, h), dpi=170)
    ax.set_xlim(0, w); ax.set_ylim(0, h); ax.axis('off')
    return fig, ax


def save(fig, name):
    fig.savefig(os.path.join(OUT, name), bbox_inches='tight', facecolor='white')
    plt.close(fig)


# 1. Six roles and what each can do
fig, ax = canvas(13, 6.3)
ax.text(6.5, 6.15, 'Six roles in the portal (faculty review, 21 Nov 2026)', ha='center', va='top', fontsize=15, weight='bold', color=DARK)
roles = [
    ('1  Resident', ['Register with consent', 'Raise requests (app, Telegram)', 'Track stages and staff updates', 'Rate, reopen within 7 days', 'Emergencies, notices, gate passes']),
    ('2  Committee member', ['Verify and approve residents', 'Assign to vendor or staff', 'Move stages (dashboard or email)', 'Notices to portal and Telegram', 'Monthly report, attendance']),
    ('3  Head of committee', ['All committee member work', 'Approve costs over the limit', 'Settings and access rules', 'Accounts for every role', 'Per-member activity report']),
    ('4  Staff', ['See only own jobs', 'Take up a job', 'Progress with note and photo', 'Punch in and out', 'Hand over at shift end']),
    ('5  Admin', ['Accounts for every role', 'Settings, approval limit', 'Feature switches, access rules', 'Telegram and email channels', 'IT tools']),
    ('6  IT staff', ['Support tickets from all roles', 'Help guides per role', 'System health check', 'Database backup', 'Maintenance notice']),
]
for i, (t, ls) in enumerate(roles):
    col, row = i % 3, i // 3
    x, y = 0.3 + col * 4.25, 3.1 - row * 2.65
    gov = t.startswith(('3', '5'))
    box(ax, x, y, 4.0, 2.4, t, ls, fill='#ffffff' if not gov else LIGHT, edge=DARK if gov else ACC)
ax.text(6.5, 0.12, 'Shaded boxes: governance roles (only they change settings, access rules and accounts). Guards are gate staff with their own allow-list.',
        ha='center', va='bottom', fontsize=8.8, color=MUTED)
save(fig, 'roles-overview.png')

# 2. Process list: request lifecycle across roles (swimlanes)
fig, ax = canvas(14, 7.4)
ax.text(7, 7.3, 'Process list: onboarding, raise a request, lifecycle 3.1 to 3.4', ha='center', va='top', fontsize=15, weight='bold', color=DARK)
lanes = [('Resident', 5.5), ('Committee', 3.9), ('Head of committee', 2.3), ('Staff', 0.7)]
for name, y in lanes:
    ax.add_patch(FancyBboxPatch((0.1, y - 0.05), 13.8, 1.4, boxstyle='square,pad=0', fc='#f6fbfd', ec='#d5e6ee', lw=1))
    ax.text(0.25, y + 0.65, name, ha='left', va='center', fontsize=10, weight='bold', color=DARK, rotation=0)
step = lambda x, y, t, fill=LIGHT, edge=ACC: box(ax, x, y + 0.12, 1.75, 1.05, t, (), fill=fill, edge=edge, size=8.8)
step(1.6, 5.5, '1 Register\n+ consent')
step(1.6, 3.9, 'Verify and\napprove')
step(3.7, 5.5, '2 Raise\nrequest')
step(5.8, 3.9, '3.1 Allocate\nvendor/staff')
step(5.8, 2.3, 'Cost over\nlimit? approve', fill='#fff', edge=DARK)
step(7.9, 0.7, '3.3 Take up,\nupdate, done')
step(7.9, 5.5, '3.2 Track\nstages')
step(10.0, 3.9, 'Confirm\nand close')
step(12.0, 5.5, '3.4 Rate or\nreopen', fill='#fff', edge=PINK)
arrow(ax, (2.45, 5.6), (2.45, 5.1))
ax.text(2.55, 5.33, 'pending', ha='left', va='center', fontsize=8.2, color=MUTED, style='italic')
arrow(ax, (3.35, 4.55), (3.9, 5.6), 'approved')
arrow(ax, (5.45, 5.95), (6.2, 5.15), 'AI suggests')
arrow(ax, (6.7, 4.0), (6.7, 3.45), 'estimate')
arrow(ax, (7.55, 4.45), (8.1, 1.85), 'assigned')
arrow(ax, (8.8, 1.85), (8.8, 5.6), 'progress')
arrow(ax, (9.65, 1.3), (10.4, 4.0), 'work done')
arrow(ax, (11.75, 4.5), (12.2, 5.6), 'resolved')
arrow(ax, (12.0, 5.65), (7.55, 4.9), 'reopen (7 days)', col=PINK, rad=0.25)
save(fig, 'process-lifecycle.png')

# 3. Cost approval and shift hand-over
fig, ax = canvas(13, 4.6)
ax.text(3.2, 4.5, 'Cost approval (head of committee)', ha='center', va='top', fontsize=12.5, weight='bold', color=DARK)
box(ax, 0.2, 2.55, 2.0, 1.2, 'Estimate', ['staff or committee'], size=10)
box(ax, 2.6, 2.55, 2.0, 1.2, 'Over limit?', ['default Rs 10,000'], fill='#fff', edge=DARK, size=10)
box(ax, 0.2, 0.4, 2.0, 1.2, 'Approved', ['work can start'], size=10)
box(ax, 2.6, 0.4, 2.0, 1.2, 'Waiting', ['head decides'], fill='#fff', edge=PINK, size=10)
box(ax, 5.0, 0.4, 1.6, 1.2, 'Rejected', ['work blocked'], fill='#fff', edge=PINK, size=10)
arrow(ax, (2.2, 3.15), (2.6, 3.15))
arrow(ax, (3.0, 2.55), (1.6, 1.6), 'no')
arrow(ax, (3.6, 2.55), (3.6, 1.6), 'yes')
arrow(ax, (2.6, 1.0), (2.2, 1.0), 'approve')
arrow(ax, (4.6, 1.0), (5.0, 1.0), 'reject')
ax.text(9.9, 4.5, 'Staff shift and hand-over', ha='center', va='top', fontsize=12.5, weight='bold', color=DARK)
box(ax, 7.2, 2.55, 1.7, 1.2, 'Punch in', ['shift starts'], size=10)
box(ax, 9.2, 2.55, 1.7, 1.2, 'Work jobs', ['take up, update'], size=10)
box(ax, 11.2, 2.55, 1.7, 1.2, 'Punch out', ['shift ends'], size=10)
box(ax, 9.2, 0.4, 3.7, 1.2, 'Hand over to colleague', ['open jobs move, both told'], fill='#fff', edge=DARK, size=10)
arrow(ax, (8.9, 3.15), (9.2, 3.15)); arrow(ax, (10.9, 3.15), (11.2, 3.15))
arrow(ax, (12.05, 2.55), (11.6, 1.6), 'optional')
ax.text(10.05, 0.1, 'Committee sees attendance and every hand-over', ha='center', va='bottom', fontsize=8.6, color=MUTED)
save(fig, 'cost-and-shift.png')
print('ok')
