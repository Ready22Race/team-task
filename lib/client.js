window.__ModuleLoader__.load({
	id: "@ready22race/dsh-team-task",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react_jsx_runtime = require("react/jsx-runtime");
		let react_dom_client = require("react-dom/client");
		let react = require("react");
		//#region lib/client/card-definition.js
		/**
		* team-task conversation card definition: folds the durable first-party
		* `tool/call` + `tool/result` records of `team_task_create` into one keyed
		* chat node, so the card survives restarts and renders in historical
		* sessions without any out-of-repo event type.
		* @module team-task/client/card-definition
		*/
		/** Parse the create-call fields the card owns (mirrors host sanitizeTaskId). */
		function parseCreateArgs(value) {
			try {
				const parsed = JSON.parse(value);
				if (typeof parsed !== "object" || parsed === null) return void 0;
				const record = parsed;
				if (typeof record.name !== "string" || record.name.trim() === "") return void 0;
				const name = record.name.trim();
				const cleaned = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
				return {
					taskId: cleaned === "" ? "task" : cleaned,
					name,
					goal: typeof record.goal === "string" ? record.goal : "",
					seededNodes: Array.isArray(record.nodes) ? record.nodes.length : 0
				};
			} catch {
				return;
			}
		}
		/** Durable first-party tool events folded into one keyed Chat node. */
		const teamTaskCardDefinition = {
			kind: "team-task",
			target: "chat",
			match: (event) => {
				if (event.type === "tool/call" && event.data.name === "team_task_create") return parseCreateArgs(event.data.arguments) === void 0 ? null : {
					id: String(event.data.callId),
					role: "start"
				};
				if (event.type === "tool/result" && event.data.message.source.kind === "tool") return {
					id: String(event.data.message.source.callId),
					role: "update"
				};
				return null;
			},
			start: (_context, match) => {
				if (match.event.type !== "tool/call") throw new Error("team-task card start requires a team_task_create tool/call");
				const parsed = parseCreateArgs(match.event.data.arguments);
				if (parsed === void 0) throw new Error("team-task card start requires valid create arguments");
				return {
					...parsed,
					accepted: false
				};
			},
			update: (context, match) => {
				if (match.event.type !== "tool/result") return context.state;
				if (match.event.data.error !== void 0 || match.event.data.message.content.some((block) => block.type === "tool-result" && block.isError === true)) return context.state;
				return {
					...context.state,
					accepted: true
				};
			},
			buildViewNode: (context) => {
				if (context.start === void 0) return null;
				const state = context.state;
				if (!state.accepted) return null;
				return {
					key: context.key,
					kind: "team-task",
					id: context.id,
					target: "chat",
					anchorSeq: context.start.event.seq,
					location: context.start.location,
					visibility: "visible",
					data: {
						taskId: state.taskId,
						leadSessionId: "",
						taskName: state.name,
						goal: state.goal,
						seededNodes: state.seededNodes
					}
				};
			}
		};
		//#endregion
		//#region lib/client/board-model.js
		/** Overall progress: approved / non-cancelled. */
		function progressOf(state) {
			const active = state.nodes.filter((n) => n.status !== "cancelled");
			return {
				done: active.filter((n) => n.status === "approved").length,
				total: active.length
			};
		}
		//#endregion
		//#region \0dsh-css:/Users/river/Documents/xb_workspace/team-task/src/client/Panel.module.css.mjs
		const css$1 = ".Uo1tjG_host{z-index:60;color:var(--dsw-alias-label-primary);font-family:inherit;font-size:12px;line-height:1.5;position:fixed;top:56px;right:16px}.Uo1tjG_pill{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-primary);cursor:pointer;border-radius:999px;align-items:center;gap:7px;padding:5px 12px;font-size:12px;display:inline-flex;box-shadow:0 4px 16px #0000002e}.Uo1tjG_pill:hover{background:var(--dsw-alias-interactive-bg-hover)}.Uo1tjG_pillCount{color:var(--dsw-alias-label-caption);font-variant-numeric:tabular-nums}.Uo1tjG_pulse{background:var(--dsw-alias-state-success-primary);border-radius:50%;width:6px;height:6px;animation:1.6s ease-in-out infinite Uo1tjG_pulse}@keyframes Uo1tjG_pulse{0%,to{opacity:1}50%{opacity:.3}}@media (prefers-reduced-motion:reduce){.Uo1tjG_pulse,.Uo1tjG_railRunning:after{animation:none}}.Uo1tjG_board{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-overlay);border-radius:14px;flex-direction:column;width:356px;max-height:calc(100vh - 96px);display:flex;overflow:hidden;box-shadow:0 12px 40px #00000047}.Uo1tjG_head{flex:none;align-items:center;gap:8px;padding:12px 10px 8px 16px;display:flex}.Uo1tjG_title{letter-spacing:.01em;white-space:nowrap;text-overflow:ellipsis;flex:1;min-width:0;font-size:13px;font-weight:600;overflow:hidden}.Uo1tjG_percent{color:var(--dsw-alias-label-caption);font-variant-numeric:tabular-nums;flex:none;font-size:11px}.Uo1tjG_headButton{width:24px;height:24px;color:var(--dsw-alias-label-caption);cursor:pointer;background:0 0;border:none;border-radius:6px;flex:none;justify-content:center;align-items:center;padding:0;font-size:14px;line-height:1;display:inline-flex}.Uo1tjG_headButton:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}.Uo1tjG_segments{flex:none;gap:3px;padding:0 16px 12px;display:flex}.Uo1tjG_segment{background:var(--dsw-alias-bg-layer-2);border-radius:2px;flex:1;height:4px;transition:background .4s}.Uo1tjG_segmentApproved{background:var(--dsw-alias-state-success-primary)}.Uo1tjG_segmentRunning{background:var(--dsw-alias-brand-primary);animation:1.6s ease-in-out infinite Uo1tjG_pulse}.Uo1tjG_segmentReview{background:var(--dsw-alias-state-warn-primary)}.Uo1tjG_segmentCancelled{background:var(--dsw-alias-bg-layer-2);opacity:.4}.Uo1tjG_body{scrollbar-width:thin;flex-direction:column;gap:12px;padding:0 16px 14px;display:flex;overflow-y:auto}.Uo1tjG_finished{color:var(--dsw-alias-label-caption);text-align:center;padding:2px 0}.Uo1tjG_attention{flex-direction:column;gap:4px;display:flex}.Uo1tjG_attentionReview{background:var(--dsw-alias-state-warn-tertiary,#d69e2e24);color:var(--dsw-alias-state-warn-label,var(--dsw-alias-state-warn-primary));border-radius:9px;align-items:baseline;gap:7px;padding:7px 10px;font-size:11.5px;display:flex}.Uo1tjG_attentionMail{color:var(--dsw-alias-label-caption);border-radius:9px;align-items:baseline;gap:7px;padding:4px 10px;font-size:11px;display:flex}.Uo1tjG_attentionIcon{flex:none;font-size:11px}.Uo1tjG_members{flex-wrap:wrap;align-items:center;gap:10px;display:flex}.Uo1tjG_member{cursor:pointer;color:var(--dsw-alias-label-caption);background:0 0;border:none;flex-direction:column;align-items:center;gap:3px;width:44px;padding:0;font-size:10px;display:inline-flex;position:relative}.Uo1tjG_member:hover{color:var(--dsw-alias-label-primary)}.Uo1tjG_avatar{color:#fff;border-radius:50%;justify-content:center;align-items:center;width:28px;height:28px;font-size:12px;font-weight:600;display:inline-flex;position:relative}.Uo1tjG_statusDot{border:2px solid var(--dsw-alias-bg-overlay);border-radius:50%;width:9px;height:9px;position:absolute;bottom:-1px;right:-1px}.Uo1tjG_statusRunning{background:var(--dsw-alias-state-success-primary)}.Uo1tjG_statusIdle{background:var(--dsw-alias-label-caption)}.Uo1tjG_statusReady{background:var(--dsw-alias-border-l3)}.Uo1tjG_memberName{white-space:nowrap;text-overflow:ellipsis;max-width:44px;overflow:hidden}.Uo1tjG_plan{flex-direction:column;display:flex}.Uo1tjG_step{gap:10px;padding:0;display:flex;position:relative}.Uo1tjG_railWrap{flex-direction:column;flex:none;align-items:center;width:16px;display:flex}.Uo1tjG_railLine{background:var(--dsw-alias-border-l2);flex:1;width:1.5px;min-height:6px}.Uo1tjG_railLineHidden{background:0 0}.Uo1tjG_rail{box-sizing:border-box;border-radius:50%;flex:none;justify-content:center;align-items:center;width:16px;height:16px;margin:2px 0;font-size:9px;font-weight:700;display:inline-flex;position:relative}.Uo1tjG_railApproved{background:var(--dsw-alias-state-success-primary);color:var(--dsw-alias-bg-overlay)}.Uo1tjG_railRunning{border:1.5px solid var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary)}.Uo1tjG_railRunning:after{content:\"\";background:var(--dsw-alias-brand-primary);border-radius:50%;width:6px;height:6px;animation:1.4s ease-in-out infinite Uo1tjG_pulse}.Uo1tjG_railReview{background:var(--dsw-alias-state-warn-primary);color:var(--dsw-alias-bg-overlay)}.Uo1tjG_railPending{border:1.5px solid var(--dsw-alias-border-l3);color:#0000}.Uo1tjG_railCancelled{border:1.5px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-caption)}.Uo1tjG_stepBody{flex-direction:column;flex:1;min-width:0;padding:4px 0 10px;display:flex}.Uo1tjG_stepTop{align-items:center;gap:6px;min-width:0;display:flex}.Uo1tjG_nodeKey{color:var(--dsw-alias-label-caption);flex:none;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:10px}.Uo1tjG_nodeTitle{white-space:nowrap;text-overflow:ellipsis;flex:1;min-width:0;font-size:12.5px;overflow:hidden}.Uo1tjG_titleDim{color:var(--dsw-alias-label-caption)}.Uo1tjG_titleStruck{color:var(--dsw-alias-label-caption);text-decoration:line-through}.Uo1tjG_stepMeta{color:var(--dsw-alias-label-caption);align-items:center;gap:6px;min-height:15px;font-size:10.5px;display:flex}.Uo1tjG_assigneeMini{align-items:center;gap:4px;display:inline-flex}.Uo1tjG_miniAvatar{color:#fff;border-radius:50%;flex:none;justify-content:center;align-items:center;width:13px;height:13px;font-size:8px;font-weight:700;display:inline-flex}.Uo1tjG_metaWarn{color:var(--dsw-alias-state-warn-primary)}.Uo1tjG_metaOk{color:var(--dsw-alias-state-success-primary)}";
		const tagId$1 = "@ready22race/dsh-team-task/Panel.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$1) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@ready22race/dsh-team-task";
			tag.dataset.pluginCss = tagId$1;
			tag.textContent = css$1;
			document.head.appendChild(tag);
		}
		var Panel_module_css_default = {
			"assigneeMini": "Uo1tjG_assigneeMini",
			"attention": "Uo1tjG_attention",
			"attentionIcon": "Uo1tjG_attentionIcon",
			"attentionMail": "Uo1tjG_attentionMail",
			"attentionReview": "Uo1tjG_attentionReview",
			"avatar": "Uo1tjG_avatar",
			"board": "Uo1tjG_board",
			"body": "Uo1tjG_body",
			"finished": "Uo1tjG_finished",
			"head": "Uo1tjG_head",
			"headButton": "Uo1tjG_headButton",
			"host": "Uo1tjG_host",
			"member": "Uo1tjG_member",
			"memberName": "Uo1tjG_memberName",
			"members": "Uo1tjG_members",
			"metaOk": "Uo1tjG_metaOk",
			"metaWarn": "Uo1tjG_metaWarn",
			"miniAvatar": "Uo1tjG_miniAvatar",
			"nodeKey": "Uo1tjG_nodeKey",
			"nodeTitle": "Uo1tjG_nodeTitle",
			"percent": "Uo1tjG_percent",
			"pill": "Uo1tjG_pill",
			"pillCount": "Uo1tjG_pillCount",
			"plan": "Uo1tjG_plan",
			"pulse": "Uo1tjG_pulse",
			"rail": "Uo1tjG_rail",
			"railApproved": "Uo1tjG_railApproved",
			"railCancelled": "Uo1tjG_railCancelled",
			"railLine": "Uo1tjG_railLine",
			"railLineHidden": "Uo1tjG_railLineHidden",
			"railPending": "Uo1tjG_railPending",
			"railReview": "Uo1tjG_railReview",
			"railRunning": "Uo1tjG_railRunning",
			"railWrap": "Uo1tjG_railWrap",
			"segment": "Uo1tjG_segment",
			"segmentApproved": "Uo1tjG_segmentApproved",
			"segmentCancelled": "Uo1tjG_segmentCancelled",
			"segmentReview": "Uo1tjG_segmentReview",
			"segmentRunning": "Uo1tjG_segmentRunning",
			"segments": "Uo1tjG_segments",
			"statusDot": "Uo1tjG_statusDot",
			"statusIdle": "Uo1tjG_statusIdle",
			"statusReady": "Uo1tjG_statusReady",
			"statusRunning": "Uo1tjG_statusRunning",
			"step": "Uo1tjG_step",
			"stepBody": "Uo1tjG_stepBody",
			"stepMeta": "Uo1tjG_stepMeta",
			"stepTop": "Uo1tjG_stepTop",
			"title": "Uo1tjG_title",
			"titleDim": "Uo1tjG_titleDim",
			"titleStruck": "Uo1tjG_titleStruck"
		};
		//#endregion
		//#region lib/client/Panel.js
		/**
		* The team-task board floater — event-log-native (design.md §6), themed with
		* the host's `--dsw-alias-*` tokens.
		*
		* Visual structure: header (title · n/m · – · ×) → segmented progress (one
		* segment per plan node, colored by status) → attention (reviews ⚠ / queued
		* mail ✉) → member avatar row → a vertical plan stepper in plan order with
		* a status rail. Modes: board ↔ pill (–) ↔ hidden (×; the conversation
		* card's board button or a new task reopens it).
		* @module team-task/client/panel
		*/
		/** Window event the conversation card fires to (re)open the board. */
		const OPEN_BOARD_EVENT = "team-task:open-board";
		/** Stable avatar hue per member name (theme-agnostic accent). */
		function avatarColor(name) {
			let hash = 0;
			for (let index = 0; index < name.length; index += 1) hash = (hash << 5) - hash + name.charCodeAt(index) | 0;
			return `hsl(${(hash % 360 + 360) % 360} 42% 46%)`;
		}
		function initialOf(name) {
			const first = [...name.trim()][0];
			return first === void 0 ? "?" : first.toUpperCase();
		}
		function segmentClass(node) {
			switch (node.status) {
				case "approved": return `${Panel_module_css_default.segment} ${Panel_module_css_default.segmentApproved}`;
				case "running":
				case "dispatched": return `${Panel_module_css_default.segment} ${Panel_module_css_default.segmentRunning}`;
				case "awaiting_review": return `${Panel_module_css_default.segment} ${Panel_module_css_default.segmentReview}`;
				case "cancelled": return `${Panel_module_css_default.segment} ${Panel_module_css_default.segmentCancelled}`;
				default: return Panel_module_css_default.segment ?? "";
			}
		}
		function railOf(node) {
			switch (node.status) {
				case "approved": return {
					className: `${Panel_module_css_default.rail} ${Panel_module_css_default.railApproved}`,
					glyph: "✓"
				};
				case "running":
				case "dispatched": return {
					className: `${Panel_module_css_default.rail} ${Panel_module_css_default.railRunning}`,
					glyph: ""
				};
				case "awaiting_review": return {
					className: `${Panel_module_css_default.rail} ${Panel_module_css_default.railReview}`,
					glyph: "!"
				};
				case "cancelled": return {
					className: `${Panel_module_css_default.rail} ${Panel_module_css_default.railCancelled}`,
					glyph: "×"
				};
				default: return {
					className: `${Panel_module_css_default.rail} ${Panel_module_css_default.railPending}`,
					glyph: "·"
				};
			}
		}
		function StepRow({ node, members, isLast, openSession }) {
			const rail = railOf(node);
			const outcome = node.runs.at(-1)?.outcome;
			const assignee = node.assignee === void 0 ? void 0 : members.find((m) => m.name === node.assignee);
			const blocked = node.status === "pending" && node.dependsOn.length > 0;
			const titleClass = node.status === "cancelled" ? `${Panel_module_css_default.nodeTitle} ${Panel_module_css_default.titleStruck}` : blocked ? `${Panel_module_css_default.nodeTitle} ${Panel_module_css_default.titleDim}` : Panel_module_css_default.nodeTitle;
			const meta = [];
			if (node.assignee !== void 0) meta.push((0, react_jsx_runtime.jsxs)("span", {
				className: Panel_module_css_default.assigneeMini,
				style: assignee === void 0 ? void 0 : { cursor: "pointer" },
				onClick: () => {
					if (assignee !== void 0 && assignee.sessionId !== "") openSession(assignee.sessionId);
				},
				children: [(0, react_jsx_runtime.jsx)("span", {
					className: Panel_module_css_default.miniAvatar,
					style: { background: avatarColor(node.assignee) },
					children: initialOf(node.assignee)
				}), node.assignee]
			}, "assignee"));
			if (node.status === "awaiting_review") meta.push((0, react_jsx_runtime.jsx)("span", {
				className: outcome === "completed" ? Panel_module_css_default.metaOk : Panel_module_css_default.metaWarn,
				children: outcome === "completed" ? "claimed · review" : "settled without claim"
			}, "review"));
			if (node.attempts > 1) meta.push((0, react_jsx_runtime.jsxs)("span", {
				className: Panel_module_css_default.metaWarn,
				children: ["attempt ", node.attempts]
			}, "attempts"));
			if (node.autoApprove && node.status !== "approved") meta.push((0, react_jsx_runtime.jsx)("span", { children: "fast-lane" }, "fast"));
			if (blocked) meta.push((0, react_jsx_runtime.jsxs)("span", { children: ["waits: ", node.dependsOn.join(", ")] }, "deps"));
			return (0, react_jsx_runtime.jsxs)("div", {
				className: Panel_module_css_default.step,
				children: [(0, react_jsx_runtime.jsxs)("div", {
					className: Panel_module_css_default.railWrap,
					children: [(0, react_jsx_runtime.jsx)("span", {
						className: rail.className,
						children: rail.glyph
					}), (0, react_jsx_runtime.jsx)("span", { className: `${Panel_module_css_default.railLine} ${isLast ? Panel_module_css_default.railLineHidden : ""}` })]
				}), (0, react_jsx_runtime.jsxs)("div", {
					className: Panel_module_css_default.stepBody,
					children: [(0, react_jsx_runtime.jsxs)("div", {
						className: Panel_module_css_default.stepTop,
						children: [(0, react_jsx_runtime.jsx)("span", {
							className: Panel_module_css_default.nodeKey,
							children: node.key
						}), (0, react_jsx_runtime.jsx)("span", {
							className: titleClass,
							title: node.goal ?? node.title,
							children: node.title
						})]
					}), meta.length > 0 && (0, react_jsx_runtime.jsx)("div", {
						className: Panel_module_css_default.stepMeta,
						children: meta
					})]
				})]
			});
		}
		function TaskBoard({ task, openSession }) {
			const reviews = task.state.nodes.filter((n) => n.status === "awaiting_review");
			const queuedMail = task.state.messages.filter((m) => m.deliveredAt === void 0);
			const members = task.state.members.filter((m) => m.retired !== true);
			const nodes = task.state.nodes;
			return (0, react_jsx_runtime.jsxs)("div", {
				className: Panel_module_css_default.body,
				children: [
					task.state.finishedAt !== void 0 && (0, react_jsx_runtime.jsxs)("div", {
						className: Panel_module_css_default.finished,
						children: ["finished · ", task.state.finishStatus]
					}),
					(reviews.length > 0 || queuedMail.length > 0) && (0, react_jsx_runtime.jsxs)("div", {
						className: Panel_module_css_default.attention,
						children: [reviews.map((node) => (0, react_jsx_runtime.jsxs)("span", {
							className: Panel_module_css_default.attentionReview,
							children: [
								(0, react_jsx_runtime.jsx)("span", {
									className: Panel_module_css_default.attentionIcon,
									children: "⚠"
								}),
								"review ",
								node.key,
								" · ",
								node.runs.at(-1)?.outcome === "completed" ? "claimed complete" : "settled without claim"
							]
						}, node.key)), queuedMail.map((message) => (0, react_jsx_runtime.jsxs)("span", {
							className: Panel_module_css_default.attentionMail,
							children: [
								(0, react_jsx_runtime.jsx)("span", {
									className: Panel_module_css_default.attentionIcon,
									children: "✉"
								}),
								message.from,
								" → ",
								message.to,
								" · queued for the next turn"
							]
						}, message.id))]
					}),
					members.length > 0 && (0, react_jsx_runtime.jsx)("div", {
						className: Panel_module_css_default.members,
						children: members.map((member) => {
							const activity = member.sessionId === "" ? "ready" : task.activity[member.name] ?? "ready";
							const dotClass = activity === "running" ? Panel_module_css_default.statusRunning : activity === "idle" ? Panel_module_css_default.statusIdle : Panel_module_css_default.statusReady;
							return (0, react_jsx_runtime.jsxs)("button", {
								type: "button",
								className: Panel_module_css_default.member,
								title: `${member.role} — ${activity}${member.model !== void 0 ? ` · ${member.model}` : ""}`,
								onClick: () => {
									if (member.sessionId !== "") openSession(member.sessionId);
								},
								children: [(0, react_jsx_runtime.jsxs)("span", {
									className: Panel_module_css_default.avatar,
									style: { background: avatarColor(member.name) },
									children: [initialOf(member.name), (0, react_jsx_runtime.jsx)("span", { className: `${Panel_module_css_default.statusDot} ${dotClass}` })]
								}), (0, react_jsx_runtime.jsx)("span", {
									className: Panel_module_css_default.memberName,
									children: member.name
								})]
							}, member.name);
						})
					}),
					(0, react_jsx_runtime.jsx)("div", {
						className: Panel_module_css_default.plan,
						children: nodes.map((node, index) => (0, react_jsx_runtime.jsx)(StepRow, {
							node,
							members,
							isLast: index === nodes.length - 1,
							openSession
						}, node.key))
					})
				]
			});
		}
		/** The floater. Board ↔ pill (–) ↔ hidden (×); session-follow. */
		function Panel({ sessionsList, openSession }) {
			const [tasks, setTasks] = (0, react.useState)([]);
			const [mode, setMode] = (0, react.useState)("pill");
			const [autoOpenedFor, setAutoOpenedFor] = (0, react.useState)("");
			const current = (0, react.useSyncExternalStore)(sessionsList.subscribe, sessionsList.getSnapshot).current;
			(0, react.useEffect)(() => {
				let cancelled = false;
				let inFlight = false;
				const tick = async () => {
					if (inFlight) return;
					inFlight = true;
					try {
						const response = await fetch("/plugins/team-task/state", { cache: "no-store" });
						if (!response.ok) return;
						const body = await response.json();
						if (!cancelled && Array.isArray(body.tasks)) setTasks(body.tasks);
					} catch {} finally {
						inFlight = false;
					}
				};
				tick();
				const timer = setInterval(() => {
					tick();
				}, 1500);
				return () => {
					cancelled = true;
					clearInterval(timer);
				};
			}, []);
			(0, react.useEffect)(() => {
				const onOpen = () => {
					setMode("board");
				};
				window.addEventListener(OPEN_BOARD_EVENT, onOpen);
				return () => window.removeEventListener(OPEN_BOARD_EVENT, onOpen);
			}, []);
			const mine = (0, react.useMemo)(() => tasks.filter((t) => current !== void 0 && t.state.leadSessionId === current), [tasks, current]);
			const task = mine.find((t) => t.state.finishedAt === void 0) ?? mine.at(-1);
			(0, react.useEffect)(() => {
				if (task !== void 0 && task.state.id !== autoOpenedFor) {
					setAutoOpenedFor(task.state.id);
					setMode("board");
				}
			}, [task, autoOpenedFor]);
			if (task === void 0 || mode === "hidden") return null;
			const progress = progressOf(task.state);
			const anyRunning = Object.values(task.activity).includes("running");
			if (mode === "pill") return (0, react_jsx_runtime.jsx)("div", {
				className: Panel_module_css_default.host,
				children: (0, react_jsx_runtime.jsxs)("button", {
					type: "button",
					className: Panel_module_css_default.pill,
					onClick: () => setMode("board"),
					children: [
						anyRunning && (0, react_jsx_runtime.jsx)("span", { className: Panel_module_css_default.pulse }),
						task.state.name,
						(0, react_jsx_runtime.jsxs)("span", {
							className: Panel_module_css_default.pillCount,
							children: [
								progress.done,
								"/",
								progress.total
							]
						})
					]
				})
			});
			return (0, react_jsx_runtime.jsx)("div", {
				className: Panel_module_css_default.host,
				children: (0, react_jsx_runtime.jsxs)("section", {
					className: Panel_module_css_default.board,
					"data-team-task-board": true,
					children: [
						(0, react_jsx_runtime.jsxs)("header", {
							className: Panel_module_css_default.head,
							children: [
								(0, react_jsx_runtime.jsx)("span", {
									className: Panel_module_css_default.title,
									title: task.state.goal,
									children: task.state.name
								}),
								(0, react_jsx_runtime.jsxs)("span", {
									className: Panel_module_css_default.percent,
									children: [
										progress.done,
										"/",
										progress.total
									]
								}),
								(0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: Panel_module_css_default.headButton,
									title: "收起",
									onClick: () => setMode("pill"),
									children: "–"
								}),
								(0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: Panel_module_css_default.headButton,
									title: "关闭",
									onClick: () => setMode("hidden"),
									children: "×"
								})
							]
						}),
						(0, react_jsx_runtime.jsx)("div", {
							className: Panel_module_css_default.segments,
							children: task.state.nodes.map((node) => (0, react_jsx_runtime.jsx)("span", {
								className: segmentClass(node),
								title: `${node.key} · ${node.status}`
							}, node.key))
						}),
						(0, react_jsx_runtime.jsx)(TaskBoard, {
							task,
							openSession
						})
					]
				})
			});
		}
		//#endregion
		//#region \0dsh-css:/Users/river/Documents/xb_workspace/team-task/src/client/TeamTaskCard.module.css.mjs
		const css = "._0usMvq_root{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);border-radius:12px;flex-direction:column;gap:6px;margin:6px 0;padding:10px 12px;font-size:12.5px;display:flex}._0usMvq_head{align-items:center;gap:8px;display:flex}._0usMvq_mark{background:var(--dsw-alias-brand-primary);width:22px;height:22px;color:var(--dsw-alias-brand-primary-invert,#fff);border-radius:7px;flex:none;justify-content:center;align-items:center;font-size:12px;font-weight:700;display:inline-flex}._0usMvq_name{text-overflow:ellipsis;white-space:nowrap;min-width:0;font-weight:600;overflow:hidden}._0usMvq_tag{color:var(--dsw-alias-label-caption);flex:none;font-size:10.5px}._0usMvq_goal{color:var(--dsw-alias-label-secondary);-webkit-line-clamp:2;-webkit-box-orient:vertical;margin:0;display:-webkit-box;overflow:hidden}._0usMvq_foot{justify-content:space-between;align-items:center;gap:8px;display:flex}._0usMvq_meta{color:var(--dsw-alias-label-caption);font-variant-numeric:tabular-nums;font-size:11.5px}._0usMvq_boardButton{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-button-ghost-active-fill,transparent);color:var(--dsw-alias-brand-text,var(--dsw-alias-label-primary));cursor:pointer;border-radius:7px;flex:none;padding:3px 10px;font-size:11.5px}._0usMvq_boardButton:hover{background:var(--dsw-alias-interactive-bg-hover)}";
		const tagId = "@ready22race/dsh-team-task/TeamTaskCard.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@ready22race/dsh-team-task";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var TeamTaskCard_module_css_default = {
			"boardButton": "_0usMvq_boardButton",
			"foot": "_0usMvq_foot",
			"goal": "_0usMvq_goal",
			"head": "_0usMvq_head",
			"mark": "_0usMvq_mark",
			"meta": "_0usMvq_meta",
			"name": "_0usMvq_name",
			"root": "_0usMvq_root",
			"tag": "_0usMvq_tag"
		};
		//#endregion
		//#region lib/client/TeamTaskCard.js
		/**
		* team-task conversation card: the durable in-conversation anchor for one
		* task — name, goal, live node/member counts, and a button that (re)opens
		* the board floater. Folds from the first-party `team_task_create` tool
		* records; live counts poll the same projection route as the board.
		* @module team-task/client/card
		*/
		/** Render one durable task as a compact conversation card. */
		function TeamTaskCard({ node }) {
			const data = node.data;
			const [live, setLive] = (0, react.useState)();
			(0, react.useEffect)(() => {
				let cancelled = false;
				const tick = async () => {
					try {
						const response = await fetch("/plugins/team-task/state", { cache: "no-store" });
						if (!response.ok) return;
						const body = await response.json();
						const found = Array.isArray(body.tasks) ? body.tasks.find((t) => t.state.id === data.taskId) : void 0;
						if (!cancelled) setLive(found);
					} catch {}
				};
				tick();
				const timer = setInterval(() => {
					tick();
				}, 2500);
				return () => {
					cancelled = true;
					clearInterval(timer);
				};
			}, [data.taskId]);
			const progress = live === void 0 ? void 0 : progressOf(live.state);
			const members = live?.state.members.filter((m) => m.retired !== true).length;
			const finished = live?.state.finishStatus;
			return (0, react_jsx_runtime.jsxs)("section", {
				className: TeamTaskCard_module_css_default.root,
				"data-team-task-card": true,
				"data-task-id": data.taskId,
				children: [
					(0, react_jsx_runtime.jsxs)("header", {
						className: TeamTaskCard_module_css_default.head,
						children: [
							(0, react_jsx_runtime.jsx)("span", {
								className: TeamTaskCard_module_css_default.mark,
								children: "T"
							}),
							(0, react_jsx_runtime.jsx)("span", {
								className: TeamTaskCard_module_css_default.name,
								children: live?.state.name ?? data.taskName
							}),
							(0, react_jsx_runtime.jsx)("span", {
								className: TeamTaskCard_module_css_default.tag,
								children: "team-task"
							})
						]
					}),
					(live?.state.goal ?? data.goal) !== "" && (0, react_jsx_runtime.jsx)("p", {
						className: TeamTaskCard_module_css_default.goal,
						children: live?.state.goal ?? data.goal
					}),
					(0, react_jsx_runtime.jsxs)("footer", {
						className: TeamTaskCard_module_css_default.foot,
						children: [(0, react_jsx_runtime.jsx)("span", {
							className: TeamTaskCard_module_css_default.meta,
							children: finished !== void 0 ? `finished: ${finished}` : progress === void 0 ? `${data.seededNodes} nodes planned` : `${progress.done}/${progress.total} approved · ${members ?? 0} members`
						}), (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: TeamTaskCard_module_css_default.boardButton,
							onClick: () => {
								window.dispatchEvent(new CustomEvent(OPEN_BOARD_EVENT));
							},
							children: "看板 board"
						})]
					})
				]
			});
		}
		//#endregion
		//#region lib/client/index.js
		/** Required services: conversation nodes, slots, and sessions navigation. */
		const inject = [
			"conversationEvents",
			"slots",
			"sessions"
		];
		/**
		* Mount the board through a body portal (the web shell has no top-right
		* slot) and register the in-conversation task card; the card's board button
		* re-activates the floater via a window event.
		*/
		function apply(ctx) {
			const host = document.createElement("div");
			host.dataset.teamTaskHost = "";
			document.body.appendChild(host);
			const root = (0, react_dom_client.createRoot)(host);
			root.render((0, react_jsx_runtime.jsx)(Panel, {
				sessionsList: ctx.sessions.list,
				openSession: (id) => {
					ctx.sessions.open(id);
				}
			}));
			ctx.effect(() => () => {
				root.unmount();
				host.remove();
			}, "team-task: board floater");
			ctx.conversationEvents.register(teamTaskCardDefinition);
			ctx.slots.inject("conversation.chat.node", () => ctx.slots.register({
				name: "conversation.chat.node",
				key: "team-task"
			}, TeamTaskCard));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map