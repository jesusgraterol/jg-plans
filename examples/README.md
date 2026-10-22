# Examples

These examples use invented prose, identifiers, names, and paths. They are public protocol examples and synthetic conformance inputs, not copied project plans. Expected observations below are specified independently of the reference parser.

| Example                 | Source                                                                             | Expected observations                                                                                                    |
| ----------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Small plan              | [plan.md](small/plan.md)                                                           | Five core fields, pending, revision 1; no milestones are necessary.                                                      |
| Optional milestones     | [plan.md](with-milestones/plan.md), [milestones.md](with-milestones/milestones.md) | Two UUID-identified milestones: first done, second pending; overview agrees with markers.                                |
| Consumer extensions     | [plan.md](extensions/plan.md)                                                      | Custom waiting-for-feedback status and nested project metadata remain intact.                                            |
| Partly deleted metadata | [plan.md](incomplete/plan.md)                                                      | Markdown body remains useful; core metadata is absent, so preferred-writer conformance has findings.                     |
| Orphan milestones       | [milestones.md](orphan/milestones.md)                                              | plan.md is deliberately absent; the remaining milestone is observable without recreating a plan or inferring permission. |

Readers do not require every example to conform. The incomplete and orphan cases demonstrate useful inspection after ordinary user edits/deletion. The overview is optional and never the source of authority over marker status.

The [protocol](../protocol/0.1/README.md) owns the format. These files can be read, copied, and edited directly. The [API](../api/README.md) and [CLI](../cli/README.md) explain reference operations.

## Runnable library example

[library.mjs](library.mjs) creates a plan with optional milestones, awaits a targeted update, inspects it, and performs an optional check. It prints a small JSON summary and removes only its own temporary root in finally. Run it with Node.js from a built checkout, or from its physical location inside an installed jg-plans package. The packed-consumer test executes this exact shipped file.
