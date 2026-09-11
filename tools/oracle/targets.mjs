// The 15 bake targets in `pyck-ai/baseimages`, with the info needed to invoke
// each image's bash `verify.sh` the same way `docker/base/verify.sh <ref>
// <variant>` etc. are invoked. Mirrors `docker-bake.hcl`'s target set and
// `examples/baseimages.imgverify.yaml`'s `match` entries.
//
// `localTag` is the tag `imgverify`'s own `pickLocalTag` (targets/resolve.ts)
// would choose for this bake target from a real `bake --print` document —
// verified by hand against the captured bake_print.json (suffix-matches the
// target's variant, else `:latest`).

export const TARGETS = [
  { bake: "base-alpine", image: "base", localTag: "base:alpine", variant: "alpine" },
  { bake: "base-debian", image: "base", localTag: "base:debian", variant: "debian" },
  { bake: "agent-alpine", image: "agent", localTag: "agent:alpine", variant: "alpine" },
  { bake: "agent-debian", image: "agent", localTag: "agent:debian", variant: "debian" },
  {
    bake: "typescript-alpine",
    image: "typescript",
    localTag: "typescript:alpine",
    variant: "alpine",
  },
  {
    bake: "typescript-debian",
    image: "typescript",
    localTag: "typescript:debian",
    variant: "debian",
  },
  { bake: "static", image: "static", localTag: "static:latest", variant: undefined },
  { bake: "rover-debian", image: "rover", localTag: "rover:latest", variant: "debian" },
  { bake: "python-alpine", image: "python", localTag: "python:alpine", variant: "alpine" },
  { bake: "python-debian", image: "python", localTag: "python:debian", variant: "debian" },
  { bake: "nginx", image: "nginx", localTag: "nginx:latest", variant: undefined },
  { bake: "golang-alpine", image: "golang", localTag: "golang:alpine", variant: "alpine" },
  { bake: "golang-debian", image: "golang", localTag: "golang:debian", variant: "debian" },
  {
    bake: "all-in-one-alpine",
    image: "all-in-one",
    localTag: "all-in-one:alpine",
    variant: "alpine",
  },
  {
    bake: "all-in-one-debian",
    image: "all-in-one",
    localTag: "all-in-one:debian",
    variant: "debian",
  },
];

export const REGISTRY = "ghcr.io/pyck-ai/baseimages";
