# Request for Comments (RFC) Process

The RFC process provides a consistent and open path for proposing major new features, breaking changes, or architectural shifts in `mcp-medic`.

## When is an RFC Required?

- Introducing a new core type or modifying `CONTRACT.md` / `src/types.ts`.
- Adding new top-level CLI commands or changing exit code semantics.
- Introducing a new built-in diagnostic check.
- Extending transport protocol support.

## RFC Lifecycle

1. **Draft**: Copy [RFC_TEMPLATE.md](./RFC_TEMPLATE.md) and fill out the sections.
2. **Review**: Open a Pull Request titled `RFC: <Feature Name>`. Maintainers and community members review the technical design.
3. **Decision**: An RFC is accepted when consensus is reached and at least 2 maintainers approve.
4. **Implementation**: Once accepted, implementation proceeds against the approved design.
