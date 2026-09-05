Research complete. Both halves are in.

Imperative DOM writes vs React-rendered position: how the ecosystem handles it
Bottom line
Your diagnosis is correct at the React source level, and the fix you've proposed is the mainstream pattern — but stated more strictly than you have it. Of every library and app I could verify at source, not one has React and imperative code writing the same DOM property. They all reduce to one writer per property. Your nested-element proposal achieves that structurally; there are three simpler ways to achieve it that are also in production use.

The single most valuable find is react-konva issue #271, where the library author hit precisely your bug, named its cause as "similar to how react-dom updates DOM nodes," and shipped a useStrictMode escape hatch whose implementation is compare the prop against the live node, not against the previous props.

PART A — React drag libraries
A0. React's actual behavior (confirmed at source)
Confirmed: ReactDOM diffs the style object against the previous props object. It never reads the DOM.

packages/react-dom-bindings/src/client/CSSPropertyOperations.js, setValueForStyles(node, styles, prevStyles), lines 151–157:


for (const styleName in styles) {
  const value = styles[styleName];
  if (styles.hasOwnProperty(styleName) && prevStyles[styleName] !== value) {
    setValueForStyle(style, styleName, value);
    trackHostMutation();
  }
}
prevStyles is the previous style prop, threaded through from updateProperties(domElement, tag, lastProps, nextProps) → setProp(domElement, tag, propKey, nextProp, nextProps, lastProp) → case 'style': setValueForStyles(domElement, value, prevValue) (ReactDOMComponent.js lines 453–456, 1518–1523).

Three consequences worth stating explicitly, because two are commonly misunderstood:

A fresh style object identity does not help. updateProperties compares at the prop level first, but even when the objects differ it delegates to the per-key diff above. Allocating {left: x, top: y} anew every render still skips writing left when the number is unchanged.
prevStyles is React's memory, not the DOM's state. Nothing in this path calls getComputedStyle or reads node.style. This is exactly the stale bookkeeping you described.
React's team considers this a known hazard. Sophie Alpert's PR facebook/react#14181 — "Warn about conflicting style values during updates" — opens: "This is one of the most insidious quirks of React DOM that people run into. Now we warn when we think an update is dangerous." (That PR covers the shorthand/longhand manifestation, not yours; same root cause, different symptom.)
Docs guidance. react.dev — Manipulating the DOM with Refs is the canonical statement, and it is more permissive than usually quoted:

Avoid changing DOM nodes managed by React. Modifying, adding children to, or removing children from elements that are managed by React can lead to inconsistent visual results or crashes like above.

You can safely modify parts of the DOM that React has no reason to update. For example, if some <div> is always empty in the JSX, React won't have a reason to touch its children list. Therefore, it is safe to manually add or remove elements there.

That second paragraph is the licence for the nested-element pattern, generalised from children to properties: a property React never renders is a property React has no reason to update.

A1. dnd-kit
Committed position	Your application state / layout. dnd-kit does not store or restore it.
In-flight offset	React context (ActiveDraggableContext), read by useDraggable.
DOM writer	React only. dnd-kit hands you a {x, y, scaleX, scaleY} object; you render style={{transform: CSS.Translate.toString(transform)}}.
Handoff at drop	Transform → null → React writes transform: undefined → element returns to its layout box, which your onDragEnd has by then updated.
Source, packages/core/src/hooks/useDraggable.ts:


const transform: Transform | null = useContext(
  isDragging ? ActiveDraggableContext : NullContext
);
ActiveDraggableContext is created with {...defaultCoordinates} (DndContext.tsx:126) and provided at line 734. useDraggable reads it only while dragging, else NullContext → null.

packages/utilities/src/css.ts:


toString(transform: Transform | null) {
  if (!transform) return;
  const {x, y} = transform;
  return `translate3d(${x ? Math.round(x) : 0}px, ${y ? Math.round(y) : 0}px, 0)`;
}
Docs are explicit that layout and drag are different properties: "For performance reasons, we strongly recommend you use the transform CSS property to move your draggable item on the screen, as other positional properties such as top, left or margin can cause expensive repaints." And "The x and y coordinates represent the delta from the point of origin of your draggable element since it started being dragged." (docs/api-documentation/draggable/README.md)

No stale-render strand is possible: React is the only writer of both properties. The committed position lives in layout (left/top/flow), the offset lives in transform, and React writes both.

<DragOverlay> is dnd-kit's separate-element answer — the closest thing in the ecosystem to your nested-element proposal, though it's a sibling rather than a child. Docs: "a way to render a draggable overlay that is removed from the normal document flow and is positioned relative to the viewport." Stated rationale includes: "update the position of the draggable source while dragging without affecting the drag overlay", containers changing mid-drag, virtualised lists where the source unmounts mid-drag, and "smooth drop animations without the effort of building them yourself." (docs)

A2. react-draggable
Committed position	position prop (controlled) or internal state.x/y (uncontrolled).
In-flight offset	Internal state.x/y, setState on every pointermove.
DOM writer	React only, via React.cloneElement(child, {style: {...child.props.style, ...style}}).
Handoff at drop	In controlled mode, onDragStop resets state back to the prop and relies on the parent to have committed.
lib/Draggable.tsx, render:


// If this is controlled, we don't want to move it - unless it's dragging.
const controlled = Boolean(position);
const draggable = !controlled || this.state.dragging;

const validPosition = position || defaultPosition;
const transformOpts = {
  x: canDragX(this) && draggable ? this.state.x : validPosition.x,
  y: canDragY(this) && draggable ? this.state.y : validPosition.y
};
...
style = createCSSTransform(transformOpts, positionOffset);
onDragStop:


// If this is a controlled component, the result of this operation will be to
// revert back to the old position. We expect a handler on `onDragStop`, at the least.
const controlled = Boolean(this.props.position);
if (controlled) {
  const {x, y} = this.props.position;
  newState.x = x; newState.y = y;
}
this.setState(newState);
getDerivedStateFromProps syncs a changed position prop into state. There's even a dev warning if you pass position without handlers: "A position was applied to this <Draggable>, without drag handlers. This will make this component effectively undraggable."

Prop docs: "position, if present, defines the current position of the element. This is similar to how form elements in React work — if no position is supplied, the component is uncontrolled."

Notable: react-draggable does a setState per pointermove and accepts the re-render cost. No imperative writes anywhere. Also relevant to your nested proposal — the README's own workaround for a conflicting writer is a wrapper element: "If the item you are dragging already has a CSS Transform applied, it will be overwritten by <Draggable>" → wrap it in a <span>.

A3. Framer Motion / motion — confirmed: React never writes the transform
Committed position	The x/y MotionValues themselves (they persist after drop).
In-flight offset	Same MotionValues.
DOM writer	Motion's renderer only. React is structurally prevented from writing transform props.
Handoff at drop	None needed — the value never left the single writer.
This is the strongest confirmation available. packages/framer-motion/src/render/html/use-props.ts:


export function copyRawValuesOnly(target, source, props) {
    for (const key in source) {
        if (!isMotionValue(source[key]) && !isForcedMotionValue(key, props)) {
            target[key] = source[key]
        }
    }
}

function useStyle(props, visualState) {
    const styleProp = props.style || {}
    const style = {}
    /**
     * Copy non-Motion Values straight into style
     */
    copyRawValuesOnly(style, styleProp as any, props)
    Object.assign(style, useInitialMotionValues(props, visualState))
    return style
}
And packages/motion-dom/src/render/utils/is-forced-motion-value.ts:


export function isForcedMotionValue(key, { layout, layoutId }) {
    return (
        transformProps.has(key) ||
        key.startsWith("origin") ||
        ((layout || layoutId !== undefined) &&
            (!!scaleCorrectors[key] || key === "opacity"))
    )
}
Read those together: every transform prop (x, y, scale, rotate, …) is stripped from the style object handed to createElement, whether or not it is a MotionValue. React's lastProps for those keys is permanently undefined. React cannot skip a write it never makes.

Docs corroborate: "Changes to the motion value will update the DOM without triggering a React re-render." (motion.dev/docs/react-motion-value)

Drag writes into those same values — packages/framer-motion/src/gestures/drag/VisualElementDragControls.ts:


private updateAxis(axis, _point, offset) {
    const axisValue = this.getAxisMotionValue(axis)
    let next = this.originPoint[axis] + offset[axis]
    if (this.constraints && this.constraints[axis]) {
        next = applyConstraints(next, this.constraints[axis], this.elastic[axis])
    }
    axisValue.set(next)
}

private getAxisMotionValue(axis) {
    const dragKey = `_drag${axis.toUpperCase()}`
    const externalMotionValue = this.visualElement.getProps()[dragKey]
    return externalMotionValue
        ? externalMotionValue
        : this.visualElement.getValue(axis, this.visualElement.latestValues[axis] ?? 0)
}
_dragX/_dragY let you supply your own MotionValue — the officially-supported hook for driving the same value from elsewhere (e.g. a WebSocket). This is the direct analogue of your rAF glide loop, done safely: one MotionValue, two producers (local drag, remote stream), one writer.

A4. react-spring (bonus — same shape, and it's what a VTT actually shipped)
packages/animated/src/withAnimated.tsx:


const callback = () => {
  const instance = instanceRef.current
  ...
  const didUpdate = instance ? host.applyAnimatedValues(instance, props.getValue(true)) : false
  // Re-render the component when native updates fail.
  if (didUpdate === false) { forceUpdate() }
}
...
// Function components must use "forwardRef" to avoid being
// re-rendered on every animation frame.
The animated HOC attaches a ref and writes values imperatively on raf.write, falling back to a React re-render only when the host can't apply them natively.

Inference (flagged): react-spring does still pass current values through host.getComponentProps(props.getValue()) into createElement, so React participates in some hosts. But because the spring writes unconditionally every frame until it settles on the target, a React write skipped by the diff cannot strand the element — the continuous writer always has the last word. This is a materially different safety property from a one-shot imperative write like yours.

A5. react-konva — this is your bug, in a shipped library, with the author's own diagnosis
The maintainer opened konvajs/react-konva#271, "Disable force update of properties of Konva nodes":

When a component is updated react-konva will change all attributes of a node exactly how it is defined in render() function. In many cases, it gives unexpected behavior for new users… The most common issue is drag&drop… on dragend the position will be reseted back to {10,10} (as defined in render).

In non-strict-mode react-konva wil update properties of the node only if they changed in render() function. That is similar how react-dom updates DOM nodes.

He shipped non-strict as the default in v16.6.0 — and users immediately hit your strand. @bmoquist:

I've built an editor that allows people to move and manipulate shapes and photos on a canvas. The positions of the objects are tracked in redux… When I upgraded where non-strict was the default, the objects were not being properly rendered on drag end and would jump back to prior positions. … I found that my React-Redux app definitely requires strict mode.

@lyleunderwood hit a double-application variant and also fixed it with strict mode.

The remedy's implementation is the important part. src/makeUpdates.ts, applyNodeProps:


var strictUpdate = useStrictMode || props._useStrictMode;
...
if (
  !isEvent &&
  (props[key] !== oldProps[key] ||
    (strictUpdate && props[key] !== instance.getAttr(key)))
) {
  hasUpdates = true;
Strict mode adds props[key] !== instance.getAttr(key) — it compares the prop against the live node, not against the previous props. That is the exact missing term in ReactDOM's setValueForStyles. React gives you no equivalent; there is no _useStrictMode for the DOM.

README, verbatim:

By default react-konva works in "non-strict" mode. If you changed a property manually (or by user action like drag&drop) properties of the node will be not matched with properties from render(). … In strict mode position of the node will be reset back to {x: 0, y: 0} (as we defined in render). But in non-strict mode the circle will keep its position, because x and y are not changed in render.

react-konva also ships a runtime warning for the setup that causes it:


ReactKonva: You have a Konva node with draggable = true and position defined but no onDragMove or onDragEnd events are handled.
Position of a node will be changed during drag&drop, so you should update state of the react app as well.
The maintainer's recommended fully controlled pattern (#360) is a third option worth noting — undo the imperative write inside the move handler, every frame:


onDragMove={e => {
  const newPos = e.target.position();
  // reset position to its old state
  // so drag is fully controlled by react
  e.target.position({ x: pos.x, y: pos.y });
  setPos({ x: Math.min(100, newPos.x), y: Math.min(100, newPos.y) });
}}
He later qualified this for groups: "I don't like the approach with reset position of dragging group. Instead I would: 1. Reset position only on dragend."

A6. react-moveable
Fully imperative, React uninvolved. README's React example: target is obtained via document.querySelector(".target"), and onDrag does target!.style.transform = transform;. React does not render transform on that element. Single writer again — by making the element non-React-styled rather than non-React-owned.

A7. React Flow / xyflow — proof that "React writes it, at 60fps" scales further than you'd expect
packages/react/src/components/NodeWrapper/index.tsx:


style={{
  ...
  transform: `translate(${internals.positionAbsolute.x}px,${internals.positionAbsolute.y}px)`,
packages/system/src/xydrag/XYDrag.ts calls updateNodePositions(dragItems, true) on every drag frame, writing into the zustand store; React re-renders and writes the transform. No imperative writes. React Flow does this for graphs of hundreds of nodes.

Relevant to your performance premise: the assumption that state-driven position is too slow deserves a measurement before it drives architecture. React Flow's approach is a store update per frame + a targeted re-render of the moved node only.

PART B — Collaborative canvas apps
System	Committed position	In-flight offset	DOM property writer	Remote in-progress drags
tldraw	reactive store, document scope	same store — no separate layer	imperative only (setStyleProperty); React never renders transform	visible, snapping at 30fps, no interpolation
Excalidraw	element array + version/versionNonce	same array, mutated in place	canvas 2D — no per-element DOM	visible; deltas broadcast every pointermove
Liveblocks	Storage LiveObject	same storage — written every pointermove	React only (style={{transform}})	visible; smoothed with a CSS transition
Figma	server-authoritative property map	same property map, applied optimistically	WebGL/canvas	not stated in the cited post
B1. tldraw — the imperative-single-writer archetype
The drag writes committed state on every move. packages/tldraw/src/lib/tools/SelectTool/childStates/Translating.ts:


override onPointerMove() { this.updateShapes() }
protected updateShapes() { moveShapesToPoint({ editor, snapshot }) }  // → editor.updateShapes()
The only "ephemeral" concept is undo grouping: onEnter does this.markId = this.editor.markHistoryStoppingPoint('translating'), reset() does bailToMark(this.markId). There is no in-flight layer, therefore no handoff at drop, therefore no strand.

React never renders transform. packages/editor/src/lib/components/Shape.tsx:


const memoizedStuffRef = useRef({ transform: '', clipPath: 'none', width: 0, height: 0, x: 0, y: 0 })

useQuickReactor('set shape stuff', () => {
    const transform = Mat.toCssString(editor.getShapePageTransform(id))
    // Update if the tranform has changed
    if (transform !== prev.transform) {
        setStyleProperty(containerRef.current, 'transform', transform)
        setStyleProperty(bgContainerRef.current, 'transform', transform)
        prev.transform = transform
    }
    ...
}, [editor])
DefaultShapeWrapper renders only className and data-* — no inline style. .tl-shape in editor.css carries position: absolute; transform-origin: top left; contain: size layout; and no transform.

This is the sharpest statement of your fix in the whole corpus: the imperative writer owns the property and owns the memo of what it last wrote. Your bug is that React holds that memo while imperative code does the writing.

useTransform (packages/editor/src/lib/hooks/useTransform.ts) — used for cursors, handles, brushes — has a docstring written for exactly your question: "Position an element by writing its transform directly, outside React's render output — the cheap path for elements that move at pointer/presence frequency."

Sync (packages/sync-core/src/lib/TLSyncClient.ts) is git-style rebase. On speculativeChanges: "The diff of 'unconfirmed', 'optimistic' changes that have been made locally by the user — if we take this diff, reverse it, and apply that to the store, our store will match exactly the most recent state of the server that we know about." rebase() = undo speculative → apply network diff → replay pending. Push cadence SOLO_MODE_FPS = 1, COLLABORATIVE_MODE_FPS = 30. Remote changes enter via Store.mergeRemoteChanges, which tags history entries source: 'remote' so the sync listener (scoped source: 'user') doesn't echo them — a tag on the change, not a mutex.

No per-shape lock (confirmed at source in TLSyncRoom.ts). Optimistic concurrency, last-write-wins per record patch. Presence (TLInstancePresence) carries cursor, camera, selection, brush, scribbles — no drag offsets and no in-flight shape transforms; shape movement travels as ordinary document-scope diffs.

Remote drags snap. No lerp, no rAF tweening, no CSS transition on .tl-shape transform. 30fps discrete steps.

B2. Excalidraw — canvas, so the DOM half doesn't transfer
Excalidraw renders every element into an HTML <canvas> via a 2D context. There is no per-element DOM node, so the stale-render class of bug cannot occur. Take the reconciliation model; do not take it as DOM evidence.

packages/excalidraw/data/reconcile.ts, verbatim:


if (
  local &&
  // local element is being edited
  (local.id === localAppState.editingTextElement?.id ||
    local.id === localAppState.resizingElement?.id ||
    local.id === localAppState.newElement?.id ||
    // local element is newer
    local.version > remote.version ||
    // resolve conflicting edits deterministically by taking the one with
    // the lowest versionNonce
    (local.version === remote.version && local.versionNonce <= remote.versionNonce))
) { return true; }   // discard the remote element
Three tiers: in-flight whitelist → higher version → lowest versionNonce tie-break. Notes: isDeleted plays no part in this comparison, and a plain drag-translate is not in the in-flight whitelist — it's protected only by the version counter, which suffices because local mutations bump version every move.

Cadence. SYNC_FULL_SCENE_INTERVAL_MS = 20000 is the full-scene safety resync, not the drag rate. Element deltas are unthrottled: App.tsx's onChange → collabAPI.syncElements(elements) fires on every scene change, and broadcastElements sends whenever getSceneVersion(elements) increased. So remote users see shapes moving mid-drag at pointermove rate. Cursors go on a separate volatile channel throttled at CURSOR_SYNC_TIMEOUT = 33 — droppable; element changes are not.

B3. Liveblocks — the React-single-writer archetype, and the best cheap trick in the report
examples/nextjs-whiteboard/pages/index.tsx:


// onShapePointerDown
history.pause();
setMyPresence({ selectedShape: shapeId }, { addToHistory: true });
setIsDragging(true);

// onCanvasPointerMove
if (!isDragging) return;
const shape = storage.get("shapes").get(shapeId);
if (shape) { shape.update({ x: e.clientX - 50, y: e.clientY - 50 }); }

// onCanvasPointerUp
setIsDragging(false);
history.resume();
Position goes to Storage on every pointermove; presence carries only selectedShape. history.pause()/resume() collapse the drag into one undo entry — the same trick as tldraw's history mark. (The advanced example does put pencilDraft in presence — the one genuinely-uncommitted thing, since a stroke becomes a layer only at pointer-up. A drag of an existing shape is not treated that way.)

The Rectangle component:


style={{
  transform: `translate(${x}px, ${y}px)`,
  transition: !selectedByMe ? "transform 120ms linear" : "none",
  ...
}}
transition: !selectedByMe ? "transform 120ms linear" : "none" is the single most transferable line in this research. Smooth remote motion from the compositor, disabled for the shape you are dragging so your own drag is 1:1 with your pointer. It is a two-line replacement for a rAF glide loop, and because it acts on a React-rendered property it has zero interaction with reconciliation.

Conflict rules (guide): LiveObject/LiveMap is "The last change to reach the server wins, per key." Optimistic: "When you change something, it applies to your own copy of the data right away." And the in-flight protection — Figma's rule restated: "While a change of yours is pending, Liveblocks can hold back other people's changes to that same value, so it doesn't briefly flip to their value and then back to yours." Presence liveness: "Each user's Presence resets every time they disconnect."

B4. Figma
From How Figma's multiplayer technology works:

Document as Map<ObjectID, Map<Property, Value>> — "a database with rows that store (ObjectID, Property, Value) tuples."
Conflict granularity is per property: "two clients changing unrelated properties on the same object won't conflict."
LWW: "the document will just end up with the last value that was sent to the server."
Authority: "the server is the ultimate authority on what the document looks like."
Optimism: "Property changes on the client are always applied immediately instead of waiting for acknowledgement from the server since we want Figma to feel as responsive as possible."
The key sentence for your problem: "So we want to discard incoming changes from the server that conflict with unacknowledged property changes." Because "our change is our best prediction because it's the most recent change we know about."
Atomicity: "changes are atomic at the property value boundary"; simultaneous editing of the same text value is an accepted non-goal.
Not in that post (checked specifically): whether intermediate drag values are streamed, any "client can lie" discussion, and rendering technology. Don't attribute those to it.

B5. Replicache / Rocicorp — the clearest formal statement of rebase
"The pending mutations applied on the client are speculative until applied on the server. In Replicache, the server is authoritative."
"…it rewinds the state of the Client View to the last version it got from the server, applies the patch to get to the state the server currently has, and then replays any pending mutations on top."
"It then atomically reveals this new state to the app." (doc.replicache.dev)

Structurally identical to tldraw's rebase(). Two independent teams converged. The "atomically reveals" step is what keeps the rewound intermediate state off-screen.

Miro: could not verify. No fetchable primary engineering post on canvas multiplayer internals; I've excluded the third-party system-design summaries rather than cite them as primary.

B6. Owlbear Rodeo — your exact domain, open source, and it solves your exact problem
This is the closest precedent that exists: a multiplayer VTT with draggable tokens on a map, React-based, open source. (owlbear-rodeo/owlbear-rodeo-legacy, React 17 + Konva.)

src/components/konva/Token.tsx:


import { useSpring, animated } from "@react-spring/konva";
...
// Animate to new token positions if edited by others
const tokenX = tokenState.x * mapWidth;
const tokenY = tokenState.y * mapHeight;
const resized = mapWidth !== previousWidth || mapHeight !== previousHeight;
const skipAnimation = tokenState.lastModifiedBy === userId || resized;
const props = useSpring({ x: tokenX, y: tokenY, immediate: skipAnimation });
...
<animated.Group {...props} draggable={draggable}
  onDragStart={handleDragStart} onDragMove={handleDragMove} onDragEnd={handleDragEnd}>
handleDragEnd:


onTokenStateChange({
  [tokenState.id]: {
    x: tokenGroup.x() / mapWidth,
    y: tokenGroup.y() / mapHeight,
    lastModifiedBy: userId,
    lastModified: Date.now(),
  },
});
Read that architecture carefully — it answers every question you have:

Committed position: tokenState.x/y, normalised 0–1 against map dimensions (so it survives map resize), synced peer-to-peer.
In-flight local drag: Konva's own draggable moves the node imperatively. react-konva is in non-strict mode, so React doesn't fight it.
Single writer of the node's position: @react-spring/konva, always. React never sets x/y on that Group.
The strand is escaped by immediate: skipAnimation. At your own drop, lastModifiedBy === userId → the spring jumps straight to the committed value. It is an unconditional write from a writer that always converges on its target — not a diff-gated one.
Remote glide is the same mechanism with immediate: false. No hand-rolled rAF loop. The comment says it outright: "Animate to new token positions if edited by others."
No per-move broadcast. onTokenStateChange is called only from handleDragEnd (verified in src/hooks/useMapTokens.tsx). Remote peers see a spring-animated glide from old position to final position; they do not follow the drag live. For a VTT that was judged acceptable.
What this suggests for your nested-transform proposal
Yes, it is the mainstream pattern — but the principle is "one writer per property," and nesting is only one way to get there. Nothing in the corpus nests specifically; they achieve single-writer by other means. Ranked by how much they'd cost you:

1. Take the property away from React (tldraw / Motion / react-moveable) — strongest match to your constraints
Stop rendering left/top from committed state. React emits the element with className + data-* only; one reactive effect (or useLayoutEffect + ref) writes position from committed state, and the same code path writes it during drag and during the rAF glide. Move the "what did I last write" memo into the writer — tldraw's memoizedStuffRef.current.transform is exactly React's prevStyles relocated to the layer that actually owns the property.

This is a smaller change than the nested element: same DOM, same CSS, you delete the style prop and add one effect. It also collapses your three writers (React, drag, rAF) into one, which the nested proposal does not — nesting still leaves drag and rAF sharing the inner transform, which is fine, but it leaves you with two coordinate systems to reason about (outer committed + inner offset) forever.

2. Take the property away from the imperative code (Liveblocks / React Flow / react-draggable)
React state on every pointermove; delete both the imperative drag write and the rAF loop. Replace the glide with:


transition: isDraggedByMe ? "none" : "transform 120ms linear"
React Flow does state-per-frame for hundreds of nodes. Measure before you rule this out — for a VTT's token count it is very likely fine, and it is by far the least code.

3. Nested inner element (dnd-kit's DragOverlay is the nearest precedent)
Legitimate, and directly licensed by the React docs' "You can safely modify parts of the DOM that React has no reason to update." Real advantages: the outer element keeps participating in layout/hit-testing/z-order while the inner one moves freely; drop animations are trivial. Real cost: an extra DOM node per token, two coordinate systems permanently, and you must still ensure the inner transform is reset at exactly the right moment relative to the outer commit — you have moved the handoff, not removed it.

4. Alternatives that appear in production but I'd rank lower for you
Force the write (react-konva strict mode). No DOM equivalent exists — you'd hand-roll it (useLayoutEffect that unconditionally sets left/top), which is really option 1 with extra steps and a double write per frame.
Undo the imperative write every frame (lavrton's controlled-drag pattern) — he himself walked it back for groups: "Reset position only on dragend."
Key-remount — nobody does this; it destroys transitions, focus, and any in-flight animation, and it's a full remount per drop.
Write the committed position imperatively at drop — patches this symptom, leaves the same trap armed for every future mid-drag re-render. Your bug will recur the moment another code path commits a position that happens to equal React's stale memory.
Two details worth stealing regardless of which option you pick
immediate / skip-animation on your own actions (Owlbear Rodeo): skipAnimation = lastModifiedBy === userId. Your own moves land instantly; only other people's glide. You need this whichever way you go, and it doubles as the strand-breaker because it makes the writer's move unconditional.
Value-based, not ===, comparison on the incoming path (tldraw's applyNetworkDiff): a semantically identical remote echo should make no change and fire no listeners. Your strand happens when an update is skipped because it equals what React thinks it rendered; theirs is skipped because it equals what is actually there. Same optimisation, correct reference point.
The one thing nobody does
No system in this corpus locks a shape while someone drags it. tldraw's server has no per-record lock (confirmed at source); Excalidraw guards only text-edit/resize/create via an appState whitelist at reconcile time; Figma and Liveblocks both express it as "discard/hold-back remote changes that conflict with my unacknowledged ones." The universal pattern is local writer wins until confirmed, implemented as a client-side filter on the incoming path — never mutual exclusion.

Sources
React CSSPropertyOperations.js (setValueForStyles) · ReactDOMComponent.js (updateProperties, setProp) · React PR #14181 · react.dev — Manipulating the DOM with Refs
dnd-kit useDraggable.ts · css.ts · DndContext.tsx · draggable docs · DragOverlay docs
react-draggable Draggable.tsx · README
Motion use-props.ts · is-forced-motion-value.ts · VisualElementDragControls.ts · MotionValue docs
react-konva #271 · #360 · makeUpdates.ts · README strict mode · Konva react drag docs
react-spring withAnimated.tsx · Animated Elements docs
react-moveable README
xyflow NodeWrapper · XYDrag.ts
tldraw Shape.tsx · useTransform.ts · Translating.ts · TLSyncClient.ts · Store.ts · TLPresence.ts · sync docs
Excalidraw reconcile.ts · Collab.tsx · Portal.tsx · app_constants.ts
Liveblocks whiteboard example · advanced whiteboard · conflict resolution guide
How Figma's multiplayer technology works
Replicache — How it works
Owlbear Rodeo Token.tsx · useMapTokens.tsx
The React-libraries research is in too, and it's the substantive one for your question. Only the virtual-tabletop agent is still running. One combined report as soon as it lands.

Those were just the placeholder wait timers I'd queued while research was in flight — no new information in them. The collaborative-apps findings had already landed and are fully incorporated into the report above. Nothing further outstanding.

Nothing new there, just the same agent confirming it's finished. Still waiting on the virtual-tabletop agent.

All research is in. Here is the report.

How other VTTs handle token dragging over the network
Nine products investigated. Confirmed = read from source or first-party docs; anything else is flagged.

Headline findings
Almost everyone streams drags (Foundry v13, PlanarAlly, MapTool, AboveVTT), and every one of them does it on a separate ephemeral channel that never touches persisted state — the same hot/cold split we have. Rates cluster at 10–20 Hz; our 20 Hz is mid-pack.
Nobody has a hold. Not one product surveyed implements a real per-token concurrency lock. Every "lock" in every product is an editing/permission lock (GM pins a token), not mutual exclusion. Our grab/deny model is more conservative than the entire field — it isn't a standard pattern we implemented wrong, it's something we invented.
Therefore nobody has an idle timeout on a hold either, because there's no hold to expire. The one product with a hold-shaped thing (MapTool) clears it only on an explicit stop message and pays for it with permanent ghost tokens. Our 10s activity timeout has no precedent in any of these products — it is the invented part, and it's the part that's biting.
Every single product renders the drag preview as a different object from the authoritative token. This is the strongest convergence in the whole survey and it is the direct answer to our bug 2.
Foundry VTT
1. Streaming. Changed between v12 and v13.

Through v12: drop-only for tokens. Drag creates a client-side preview clone — PlaceableObject#clone() is documented as producing an object that is "non-interactive, and has no assigned ID", with isPreview / _original accessors. DB writes happen only at drop, via _prepareDragLeftDropUpdates ("the database updates that should occur as the result of a drag-left-drop operation"). (PlaceableObject API) That core doesn't broadcast drags is confirmed by the existence of the Live Drag module (source), which bolts it on by wrapping Token.prototype._onDragLeftStart and emitting a "showDrag" socket event on every refreshToken hook — no throttle, no lock. A community hack, not a design.
v13 broadcasts the drag, but as a path, not a moving token. The Token Drag Measurement overhaul (release 13.332, epic #11185) added Token#_plannedMovement: { [userId: string]: TokenPlannedMovement }, documented simply as "The ruler data" (Token API). TokenPlannedMovement is {foundPath, history, unreachableWaypoints, hidden, searching} (v13 type) — a path keyed by user, with a hidden flag driven by holding ALT. So other clients see your planned route while you drag; the token disc itself stays put until the drop.
Transport — this is the most directly transferable thing in the survey. User#broadcastActivity(activityData, {volatile}):

"Submit User activity data to the server for broadcast to other players. This type of data is transient, persisting only for the duration of the session and not saved to any database. Activity data uses a volatile event to prevent unnecessary buffering if the client temporarily loses connection." (User API)

Throttle is 100 ms — Ruler#_broadcastMeasurement: "Broadcast Ruler measurement if its User is the connected client. The broadcast is throttled to 100ms." plus a private #throttleBroadcastMeasurement field (v12 Ruler API). Canvas has a matching private #throttleOnMouseMove (v12 Canvas API).

2. Hold/lock. The epic #11185 lists as a requirement: "Improve the framework for locking a token so that only one measurement is occurring per token at a time." I could not confirm that a drag-time mutual-exclusion lock actually shipped. What did ship is movement-operation ownership after commit: startMovement() ("Only owners of the Token can start"), pauseMovement() / stopMovement() ("Only the User that initiated the movement can pause/stop it") (TokenDocument API). There is no timeout anywhere in this — liveness is the socket connection.

The cost of having no drag lock is documented in their own tracker. #10538 "Two users moving the same token simultaneously can cause one user to become out-of-sync and see double tokens", with a crisp repro from a commenter:

"We have a very easy time reproducing this by just having user A dragging the token (preview active), user B dragging and dropping the same token, and then user A finally dropping theirs."

Atropos: "We will prioritize an investigation of this issue during the user testing phase before v12 goes stable." Final state: closed as nonrepro/wontfix.

3. Local vs remote render. Preview clone locally; on commit the document update animates for everyone via Token#animate (v13 added a chain option that "waits for the current animation of the same name to finish first"). Default speed is CONFIG.Token.movement.defaultSpeed = 6 grid spaces/second (#11697).

4. Design note — the one you should read. #9617 "Only emit userActivity as a volatile event if it does not contain un-missable data" is our bug family exactly:

"When ending a ruler measurement while the websocket is busy… the ruler will get stuck on the other player's screens. It will only disappear once a new ruler measurement is started… If the packet being dropped is the packet that sets ruler to null, the other player's clients will never be informed of this and the ruler will be shown by their clients indefinitely."

Three options were proposed: revert to non-volatile; add an explicit important parameter; or infer from the payload. They shipped both of the last two — today's signature is broadcastActivity(activityData, {volatile}) with "If undefined, volatile is inferred from the activity data." Intermediate frames lossy, terminal frames reliable.

Owlbear Rodeo
1.x legacy (open source, React + Konva + socket.io)
1. Streaming: none for tokens. src/components/konva/Token.tsx — onDragMove mutates Konva local state only; nothing goes to the network until handleDragEnd, which commits normalised coords plus lastModifiedBy: userId, lastModified: Date.now(). State rides useNetworkedState (src/hooks/useNetworkedState.ts): 500 ms debounce, partial diffs on `${eventName}_update` and full state on eventName. Persistence to IndexedDB is separately debounced 500 ms and only by the map owner.

But they do stream pointers, at exactly our rate. src/network/NetworkedMapPointer.tsx: const sendTickRate = 50; (20 Hz), sent via sessionRef.current.socket.volatile.emit("player_pointer", ...), not persisted, and remote pointers are interpolated with Vector2.lerp() inside a dedicated requestAnimationFrame loop. That is our token-move-frame design, applied to cursors and deliberately not to tokens.

2. Hold: none. TokenState.locked: boolean is a persisted column on the token (src/types/TokenState.ts) toggled by the GM — an authoring pin, not a lease. The concurrency fields are lastModifiedBy / lastModified, i.e. last-write-wins bookkeeping.

3. Reconciliation — the exact idiom for our bug 2. From Token.tsx:


// Animate to new token positions if edited by others
const skipAnimation = tokenState.lastModifiedBy === userId || resized;
const props = useSpring({ x: tokenX, y: tokenY, immediate: skipAnimation });
Your own echo lands immediate (no tween — you're already there); everyone else's tweens. One flag, both cases.

2.0 (closed, but the extension SDK is publicly documented)
The Interaction API docs state the model outright:

"An interaction allows you to provide high frequency updates to Owlbear Rodeo without needing to worry about networking. Interactions in Owlbear Rodeo use an interpolated snapshot system where high frequency updates are applied in real-time locally but sampled at a lower frequency to be sent over the network to other players. On the receiving end low frequency snapshots are buffered and interpolated to ensure smooth playback."

And, precisely on our bug 2:

"When you update a value using an interaction a faster rendering path will be used. This fast path works by skipping the processing of any hierarchy data and updating values directly on the renderer. Because of this method not all parameters are available when changing values in an interaction."

The canonical shape is startItemInteraction on drag start → update() on drag move → stop() on drag end/cancel, returning [dispatch, stop] (confirmed in @owlbear-rodeo/sdk@3.1.0 typings, lib/api/InteractionApi.d.ts, lib/types/Interaction.d.ts). Note SceneLocalApi.updateItems carries a fastUpdate?: boolean parameter that SceneItemsApi.updateItems does not — local/ephemeral items get the fast path, networked ones don't. They also deliberately narrowed the set of "interactive values" so the fast path can't desync anything structural.

PlanarAlly (Vue + canvas + socket.io) — closest mirror of our design
Confirmed at commit 63cc8ae.

1. Streams, ~66 Hz, presence-only via a flag on the same event. One event, Shapes.Position.Update, carrying temporary: boolean. Drag frames send temporary: true (client/src/game/tools/variants/select/index.ts L532), mouse-up sends false (L759). Server side, persistence is gated exactly on that flag (server/src/api/socket/shape/__init__.py L131–168): the sqlite write and the entire ownership check live inside if not data.temporary. Throttle is at the DOM event: throttle(mouseMove, 15) — lodash leading+trailing, so ≲66/s. No rAF batching, no server-side rate limit.

Worth stealing the docstring on moveShapes: @param temporary Flag to indicate near-future override — i.e. "another update is imminent, skip expensive work". They use it to skip vision/lighting retriangulation during drag and redo it on mouse-up. The perf win is not just the DB write.

2. Hold: none, confirmed by both presence and absence. Selection is entirely client-local and never emitted. No Shape.Lock.Acquire, no claim/lease/heartbeat anywhere in 59 shape handlers. is_locked is a persisted boolean column (the pin again). Ownership (has_ownership) is a static ACL that multiple users can hold on the same shape at once. No timeout, no disconnect cleanup for in-flight drags — the disconnect handler clears temporary shapes (ruler/ping) but never commits an in-flight position, so a mid-drag crash leaves other clients rendering a position the DB doesn't have; it reverts on next reload.

3. Sender excluded from its own echo via skip_sid=sid — there is no echo to reconcile. Remote application is a bare absolute set with no interpolation (shape.setPositionRepresentation(sh.position)); smoothness is purely 66 Hz plus the rAF draw loop. The receiver can't even distinguish a drag frame from a commit — the server unwraps the envelope and the broadcast payload has no temporary field.

Two notes worth carrying: local movement is applied as a relative delta while remote echoes are absolute, so two simultaneous draggers produce a genuine tug-of-war oscillation (inferred from code, not tested); and because the temporary branch skips has_ownership entirely, drag frames are unauthenticated — a client can make any shape appear to move for everyone. The author's own comment nearby: # This stuff is not stored so we cannot do any server side validation /shrug.

MapTool (Java, RPTools) — has a hold-shaped thing, and shows what happens without cleanup
Confirmed at develop HEAD 92370a3.

1. Streams, on four dedicated ephemeral messages. StartTokenMoveMsg / UpdateTokenMoveMsg / StopTokenMoveMsg / ToggleTokenMoveWaypointMsg (message.proto, fields 51/52/53/63). Only the leader token's anchor point goes on the wire; followers in a multi-select are derived locally on every client.

Rate limiting is a single-slot coalescing queue at 100 ms (ServerCommandClientImpl.java): enqueue() overwrites the pending message, a thread flushes every 100 ms — newest position beats complete history. stop and toggleWaypoint bypass the queue but flush() first, so the final position can't be stranded behind the drop.

2. Never persisted. In ServerMessageHandler, the four move messages fall into a bucket with no handler at all — just sendToClients(id, msg). Contrast PUT_TOKEN_MSG immediately above, which calls handle(...) to mutate the campaign before broadcasting. The class javadoc explains why the server keeps a model copy at all: "new clients receive the server's campaign data when connecting." In-flight drags deliberately aren't part of that.

3. The hold is advisory and client-local. ZoneViewModel.movingTokens is recomputed from whatever SelectionSets exist in the local map — local and remote alike — and isTokenMoving() gates drag start in PointerTool (L738, L1093 with the comment // Only one person at a time) and StampTool. But ZoneRenderer.addMoveSelectionSet carries an unenforced aspiration:


// I'm not supposed to be moving a token when someone else is already moving it
selectionSetMap.put(keyToken, new SelectionSet(...));
A colliding start silently replaces the entry. There's no server arbitration; ServerMessageHandler.putToken() does zero authorization. Two clients starting within one RTT both succeed and last write wins.

Cleanup: none. stopTokenMove has exactly one caller — inside commitMoveSelectionSet. No timeout, no disconnect handler synthesising a stop, no server-side drag registry. A client that drops mid-drag leaves a permanent ghost on every other client, and their isTokenMoving guard refuses further drags of that token until reload. This is a real, recurring bug class: #595 — "the original token becomes a 'ghost' and cannot be moved anymore, and its path is permanently drawn on the map" — fixed by PR #926 whose approach was force the drag to commit so the stop message gets sent, not add a cleanup path. This is our bug 1 with the sign flipped: we expire holds too eagerly, MapTool never expires them at all.

4. Render. No interpolation anywhere — remote tokens snap to each 10 Hz update (open FR #4795 asks for smoothing). The token is drawn twice: at its committed position at 50% opacity, and at the dragged position at full opacity with path, waypoints, distance label, and the dragging player's name underneath. Local and remote drags render in different passes with different fog clipping (PR #6002).

Confirmed rubber-band bug, still open: #5036 — commitMoveSelectionSet broadcasts putToken inside the loop and only afterwards runs the onTokenMove veto, which reverts via a second putToken. "other clients can observe the token in its new position only for it to snap back to its previous location if denied." Textbook optimistic-broadcast-then-compensate. If you validate a drop server-side, validate before you broadcast.

AboveVTT (open source browser extension) — closest to our exact numbers
Streams at 50 ms (20 Hz) on a separate peer channel. Two transports by design: durable state over a central WSS relay (MessageBroker.js), ephemeral presence over WebRTC/PeerJS (PeerManager.js). In Token.js the jQuery-UI drag handler coalesces to one update per requestAnimationFrame, then:


const sendTokenPositionToPeers = throttle((tokenX, tokenY, tokenId, includeRuler) => {
  window.PeerManager.send(PeerEvent.cursor(tokenX, tokenY, tokenId, includeRuler));
}, 50);
The throttle helper is leading+trailing, so the final position of a fast drag is never dropped. Hidden tokens are never streamed.

Receivers draw a ghost, not the token: peer_is_dragging_token() clones the token div, blanks its data-id, strips drag/selection classes, sets opacity: 0.5. The real token doesn't move on anyone else's screen until drop. Receive side is rAF-coalesced and gated by a per-viewer preference with values none / all / dm / combatTurn.

Commit is a 300 ms debounce sending the entire options object over the durable channel. No lock — isPlayerLocked()/isDMLocked() are permission checks; two people can grab the same token and the later debounced write wins wholesale.

A candid maintainer comment in rotate() shows the trade-off was made per-interaction: "If we ever want this to send to all players in real time, simply comment out the rest of this function and call place_sync_persist() instead." — rotation deliberately drop-only, position deliberately streamed.

Roll20 / Fantasy Grounds / Alchemy
Roll20 — drop-only, no lock, nothing officially documented. Community consensus (Forum Champion, not staff) in this thread: "No, there's no method for others to see the movement of a token while it is 'picked up'." Workarounds are arrow keys (discrete committed moves) or mid-drag waypoints. Corroborating: the documented graphic.lastmove is "a comma-delimited list of coordinates the token has moved through" — a whole path arriving as one property is the signature of a single commit. All Roll20 "locks" are permission/accident locks. First-party colour on the sync model comes from CTO Mike Todd on the official blog: whole-object Firebase push, and "updates occasionally seem to vanish into the ether when two or more people have the same sheet open simultaneously" — though that is about character sheets, not tokens; extending it to tokens is inference.

Fantasy Grounds — solves contention socially, with a two-phase commit. Confirmed from the official API reference:

"By default, token instances can be manipulated by the host and all clients. The token container may be locked, in which case vectors may be drawn out from the token by the clients to indicate movement requests. Tokens can also be toggled non-modifiable."

And the Token Locking wiki page: players compose a planned path, "The movement path shown will begin with their player color. GM's can see this and approve or cancel the movement." A GM approval panel with Accept All / Cancel All and Ctrl-Z. The onDrag/onDragStart/onDragEnd Lua events are documented as local input events — nothing first-party says raw drag positions are streamed. The widely-believed "FG shows the token being dragged" is confirmed only for planned pathways under token locking, not free-drag streaming.

Alchemy RPG — nothing public. No engineering blog, dev diary, or architecture write-up exists. Would require empirical testing.

Patterns across products, and what they say about our two bugs
Rate and transport
Streams drag?	Rate	Transport	Persisted?	Hold?
Foundry v12	No (local preview clone)	—	—	drop only	No
Foundry v13	Yes — planned path, per user	100 ms (10 Hz)	volatile socket, broadcastActivity	never	No (a stated epic goal; ship unconfirmed)
Owlbear 1.x	No (pointers only)	pointers 50 ms (20 Hz)	socket.volatile.emit	pointers never	No
Owlbear 2.0	Yes	"sampled at a lower frequency"	interaction channel	never	No
PlanarAlly	Yes	~15 ms (~66 Hz)	same event + temporary flag	gated on flag	No
MapTool	Yes	100 ms (10 Hz), coalesced	dedicated msgs, pure relay	never	Advisory, client-local
AboveVTT	Yes — 50% ghost	50 ms (20 Hz) + rAF	WebRTC peer channel	never	No
Roll20	No	—	Firebase	drop only	No
Fantasy Grounds	Path proposal only	—	host-authoritative	on approval	GM approval instead
Our 20 Hz + rAF glide + presence-only relay is squarely orthodox. That part of our design matches AboveVTT almost exactly and Owlbear's pointer channel exactly.

Bug 1 — a still hand loses its hold after 10 s
The root cause is that we infer liveness from data frames. A hand held still emits no move frames, but the user is unambiguously still holding. Movement and liveness are different facts and we've conflated them.

No surveyed product has this bug, because no surveyed product uses activity to decide whether a hold is alive:

Foundry: presence lifetime = socket lifetime. Volatile frames are lossy by design; the terminal frame is sent reliably (the fix for #9617). Nothing decays on idleness.
Owlbear 1.x: remote pointer state is cleared on disconnect, not on idleness.
MapTool: cleared only by an explicit StopTokenMoveMsg. No timeout at all — and that's its own bug (#595), the mirror image of ours.
General precedent: Liveblocks documents that a user's Presence resets every time they disconnect — presence is connection-scoped, full stop.
The transferable fix: bind hold liveness to the connection (which we already do on disconnect) plus explicit release, and delete the activity timeout. If you want an abandonment backstop for the half-open-socket case, drive it off a heartbeat the client emits while the pointer is down regardless of movement — separate "I'm still holding" from "I moved". That is a different message from a move frame, and it should be reliable, not volatile.

The second half of this bug — the token "appears free/parked at its origin on everyone else's screen" — is a rendering choice three products made independently and deliberately: MapTool draws the token at 50% opacity at its committed position and at full opacity at the drag position with the dragger's name label; AboveVTT draws a 0.5-opacity ghost clone; Foundry dims the original behind its preview. A remote client that has lost the drag then degrades to "token at its last committed spot", which is honest, rather than "token is free", which is a lie. If the disc showed a held-by-someone affordance driven by the hold rather than by move frames, a stalled drag would look stalled instead of looking released.

Bug 2 — imperative style write vs React-owned style
The root cause is two writers for one property. React diffs against its own previous virtual value, so an out-of-band write is invisible to it and won't be corrected. React's docs are explicit: "Avoid changing DOM nodes managed by React… you can risk conflicting with the changes React is making", and safety exists only for "parts of the DOM that React has no reason to update" (react.dev). The same bug in the Konva world is react-konva #360 — "Any component marked draggable seems to switch between managing its own state and respecting the x, y values that it gets as props" — where the maintainer concedes "I don't know how to make fully controlled drag&drop."

Every product solves it the same way: the drag preview is a different object from the authoritative token. This is unanimous.

Foundry — drag manipulates a preview clone ("non-interactive, and has no assigned ID"); the real Token is never imperatively moved.
Owlbear 2.0 — startItemInteraction returns a separate handle whose updates take "a faster rendering path… skipping the processing of any hierarchy data and updating values directly on the renderer", with a deliberately restricted set of interactive values.
MapTool — SelectionSet is a standalone object holding startPoint/currentPoint/playerId; it never writes to Token or Zone. The renderer draws the Token declaratively and the SelectionSet offset imperatively, as two passes.
AboveVTT — clones the token div and blanks its data-id so the ghost is a different DOM node with no identity.
Owlbear 1.x — the Konva node owns its position during drag (uncontrolled), and the authoritative echo lands via immediate: skipAnimation when lastModifiedBy === userId.
So the fix isn't to force React to re-write the style. It's to stop React and the drag from owning the same property: give the drag its own element (or its own transform layer) that React does not render a position for, leave the React-owned disc at the last authoritative position, and swap between them at grab and release. Owlbear's one-liner is the cheap version of the same idea and worth having regardless — make the authoritative echo a no-op for the client that caused it.

One more, unasked but worth flagging
MapTool #5036 (open since 2024) is a rubber-band caused by broadcasting the commit before running validation, then reverting with a second broadcast. Since we broadcast the full authoritative board after the MongoDB write, any validation we add to the drop must run before the write and broadcast, never after.

All three research threads are back. Here is what they found, in plain terms, and what it changes.

Your bug: how everyone else avoids it
The one rule every library and app follows is: one writer per position. Nobody lets React and hand-written code both set the same property on the same element. Our layer breaks that rule, and the research found our exact bug in the wild: react-konva's author hit it, described its cause as "similar to how react-dom updates DOM nodes", and his users reported shapes that "jump back to prior positions on drag end" (react-konva #271). His fix compares against the live node instead of React's memory. React DOM has no such switch, which is why we have to pick a side.

There are three ways people pick a side, from least to most code:

React never positions the disc. React draws the element with no position at all. One piece of our code writes the position in every case: from committed state when a commit lands, from the pointer during your drag, from the stream for other people. That code keeps its own memory of what it last wrote. This is what tldraw does for every shape (Shape.tsx) and what Framer Motion does structurally. For us it is the same DOM and the same CSS. We delete the position from the style prop and add one effect. The drag-end reset and the settle-to-committed logic both disappear, because nothing can strand a disc when only one writer exists.

React positions everything. Put the position into state on every mouse move and delete the hand-writes and the animation loop entirely. Other people's discs get smoothed by a CSS transition instead of a loop. Liveblocks' whiteboard does exactly this in one line: a transition for shapes others are moving, none for the one you hold (example). React Flow does state-per-frame for hundreds of nodes. Least code of the three, but our live positions currently live at GameContent level, so this needs them moved into the layer first or the whole game re-renders per frame.

The dragged thing is a separate object. This is the "sticker" I explained badly. It is the unanimous VTT choice: Foundry drags a preview clone, AboveVTT drags a half-transparent ghost with its id blanked, MapTool draws the token twice, dnd-kit ships a DragOverlay. Legitimate, but for us it adds a node per token and a second coordinate system for good.

Two things the research pushed back on. My earlier "write the destination at drop" fix ranks lowest: it patches the symptom and leaves the trap armed for the next code path. And the assumption that state-driven positions are too slow was never measured. I would now recommend option 1 as the fix, since it keeps our current performance model and deletes the two pieces of code that have caused both token bugs.

Hold liveness: how everyone else does it
No virtual tabletop surveyed has a per-token hold at all. Foundry, Owlbear, PlanarAlly, MapTool, AboveVTT, Roll20 and Fantasy Grounds all run last-write-wins. Our grab-and-deny model is our own invention, which is fine, but the ten-second idle expiry has no precedent anywhere. Every real-time system ties liveness to the connection and never to activity:

Liveness is a heartbeat on a fixed timer, not user movement. Yjs renews every fifteen seconds, Liveblocks and Socket.IO ping every twenty-five to thirty. Any inbound message counts as alive.
Explicit release and disconnect are immediate. Nothing waits for a timer.
Idle is cosmetic. Excalidraw shows an "away" badge after a minute of no pointer movement, and it never removes anyone or releases anything.
A staleness sweep exists only as the widest backstop, tagged so a timeout reclaim can be told apart from a real release.
The mirror image of our bug exists too. MapTool clears a drag only on an explicit stop message, so a client that dies mid-drag leaves a permanent ghost (#595). Keep a backstop, just a rare one.
Two pitfalls worth carrying into the design. Chrome throttles timers in a hidden tab to once a minute after five minutes, which starved SignalR's own heartbeat and produced false disconnects, so a heartbeat needs a visibility rule rather than blind trust in the timer. And Foundry learned that lossy presence frames are fine but the terminal frame must be reliable, after dropped release packets left rulers stuck on other players' screens (#9617).

One visual idea three products reached independently: while a token is held, draw it faded at its committed spot and solid at the hand's position. A stalled drag then looks stalled instead of looking free.

What I'd change in the plan
The plan's liveness direction survives intact and now has precedent behind every part of it. The fix for your bug should become option 1 above rather than either the narrow drop-time write or the nested element. I have changed neither code nor the plan file. Say the word and I will revise the plan along these lines.