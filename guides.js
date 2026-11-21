// Short training guides per role (faculty review: IT staff provide training). Served by GET /api/help/guides.
// roles: resident | member | head | sysadmin | staff | it | guard | all
module.exports = [
  { id: 'start', title: 'Getting started', roles: ['all'], steps: [
    'Sign in with the email and password you were given or registered with.',
    'The menu shows only what your role can use. You can move it to the side or the top, or hide it.',
    'The bell shows your notifications. New items also appear without reloading the page.',
    'Problem with the portal itself? Open Support and raise a ticket for the IT team.'] },
  { id: 'resident-register', title: 'Register and get verified', roles: ['resident'], steps: [
    'Choose Join, enter your name, email, flat, phone and a password, and tick the consent box.',
    'The committee checks that you live in the flat and approves your account. You can sign in once approved.',
    'Owners can add family members and tenants from Household; the committee approves them too.'] },
  { id: 'resident-request', title: 'Raise and track a request', roles: ['resident'], steps: [
    'Choose New request, pick a category, describe the problem and add a photo if it helps.',
    'Or send a message to the society Telegram bot after sharing your contact once.',
    'Follow the stage tracker: Open, Assigned, In progress, Resolved. Staff updates appear on the request.',
    'When it is resolved, rate the work from 1 to 5. If the problem comes back within 7 days, choose Reopen and say what is still wrong.'] },
  { id: 'resident-emergency', title: 'Emergencies', roles: ['resident'], steps: [
    'Use the Emergency button (fire, medical, lift, theft) or write "fire" or "help please" to the bot.',
    'The committee is alerted at once by dashboard, notification and email.'] },
  { id: 'committee-dashboard', title: 'Committee: daily work', roles: ['member', 'head', 'sysadmin'], steps: [
    'Start from "Needs your attention": approvals, unassigned requests, overdue requests, emergencies and messages.',
    'Approve or reject new residents after checking their flat.',
    'Open a request, check the AI suggestion, and assign a vendor or a staff member.',
    'Move the request forward when work starts and when it is done. You can also do this from the email buttons.',
    'Post notices: they reach every resident in the portal and on Telegram.'] },
  { id: 'committee-cost', title: 'Costs over the approval limit', roles: ['member', 'head', 'sysadmin'], steps: [
    'Add a cost estimate on the request (staff can add one too).',
    'Estimates above the approval limit wait for the head of committee; work cannot start or close until approved.',
    'The head approves or rejects from Cost approvals. Every decision is in the audit trail.'] },
  { id: 'head', title: 'Head of committee', roles: ['head'], steps: [
    'Approve or reject costs above the limit from Cost approvals.',
    'Use Reports for the monthly figures and each committee member\'s activity; print it for the general body meeting.',
    'Only you and the admin can change settings, feature switches, access rules and accounts.'] },
  { id: 'admin', title: 'Admin', roles: ['sysadmin', 'head'], steps: [
    'Accounts: create committee members, the head, staff, IT and guard accounts; suspend or remove them.',
    'Settings: society name, approval limit, feature switches, access rules per resident type, message channels.',
    'At least one head or admin account must stay active.'] },
  { id: 'staff-jobs', title: 'Staff: your jobs', roles: ['staff'], steps: [
    'Punch in when your shift starts.',
    'My jobs lists the work assigned to you. Choose Take up to start; the resident is told.',
    'Add progress updates (started, waiting for parts, done) with a note and a photo.',
    'If parts or outside work cost money, add a cost estimate. Big amounts wait for the head of committee.',
    'Mark Work done when finished; the committee confirms and closes it.'] },
  { id: 'staff-shift', title: 'Staff: end of shift and hand-over', roles: ['staff'], steps: [
    'Choose Punch out at the end of your shift.',
    'If jobs are still open, pick the colleague taking over and write a short hand-over note.',
    'All your open jobs move to that person, and the committee sees the hand-over in the attendance list.'] },
  { id: 'guard', title: 'Guard: gate', roles: ['guard'], steps: [
    'Scan the visitor QR code or type the 6-digit code to check a gate pass.',
    'Residents show their own gate token; the result says allowed or refused.',
    'The gate log lists every check.'] },
  { id: 'it', title: 'IT staff', roles: ['it', 'sysadmin'], steps: [
    'Support queue: answer tickets, set them to in progress or resolved. The person who raised it is notified.',
    'System health shows uptime, database size, integrity check and counts.',
    'Before an upgrade, download a backup and post a maintenance notice; clear the notice afterwards.',
    'The free hosting plan wipes the database on redeploy: always back up first.'] },
];
