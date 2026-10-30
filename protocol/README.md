# The jg-plans protocol

A plan is an ordinary Markdown document. Optional metadata makes it easier to identify and revise; acceptance criteria with stable IDs say what done means; optional milestones describe progress when a task benefits from separate review boundaries.

| Version | Status                     | Specification                 |
| ------- | -------------------------- | ----------------------------- |
| 0.2     | Provisional draft, current | [Protocol 0.2](0.2/README.md) |

Protocol 0.2 is the only supported version. New plans declare `protocol: "0.2"`; unversioned Markdown uses the same rules. Unsupported declarations receive diagnostics while source remains readable.

The protocol belongs to jg-plans. Applications choose their own approval, execution, coordination, and retention policies. The reference library and CLI are implementations of this protocol, not prerequisites for using it.

Start with the [small plan](../examples/small/plan.md), compare [optional milestones](../examples/with-milestones/milestones.md), see [acceptance criteria](../examples/criteria/plan.md) in a 0.2 plan, or explore [the examples](../examples/README.md).

Protocol versions are independent of npm package versions. Version 0.2 remains provisional until jg-skills and at least one HQ consumer exercise separately approved integrations.
