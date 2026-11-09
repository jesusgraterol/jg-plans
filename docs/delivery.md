# Delivery

The default stop is **development**. Stops are ordered; reaching main includes development.

## development

Operator: agent.

Run the required [development checks](development.md), review and commit only the task's changes, merge into development and push. Verify from fresh remote refs that origin/development contains the task commit. Keep the primary installed CLI unchanged during an explicitly staged ecosystem cutover.

## main

Operator: agent.

Follow [releasing](releasing.md): prepare the new version, qualify its exact archive, open development → main, wait for checks and merge. Verify the merged main workflow, published archive, latest tag, provenance and signature against its retained receipt. Follow [website delivery](website.md) to refresh and verify the matching public release presentation. A version listing alone is insufficient.

## Closing evidence and cleanup

Read branch, HEAD, working-tree status and remote containment live. Report the published version and verified website artifact for main. Remove only this task's clean, merged and inactive branches, worktree and temporary folders; preserve release receipts until verification ends. Planning records remain progress bookkeeping and are reported separately from source publication. A blocked publication, failed check, unverified artifact or task-owned residue prevents a safe close.
