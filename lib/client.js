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
		const css$1 = ".Uo1tjG_host{z-index:60;pointer-events:none;color:var(--dsw-alias-label-primary);--tt-primary:#7b73ff;--tt-primary-soft:#7b73ff21;--tt-primary-border:#7b73ff3d;--tt-primary-text:#a9a3ff;--tt-cyan:#65d8c2;--tt-cyan-soft:#65d8c21a;--tt-cyan-border:#65d8c233;--tt-amber:var(--dsw-alias-state-warn-primary,#ffb85c);--tt-surface:var(--dsw-alias-bg-layer-1);--tt-surface2:var(--dsw-alias-bg-layer-2);--tt-border:var(--dsw-alias-border-l1);--tt-muted:var(--dsw-alias-label-secondary);--tt-dim:var(--dsw-alias-label-caption);flex-direction:column;align-items:flex-end;font-family:inherit;font-size:12px;line-height:1.5;display:flex;position:fixed;top:56px;bottom:16px;right:16px}.Uo1tjG_host>*{pointer-events:auto}.Uo1tjG_pill{border:1px solid var(--tt-border);background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-primary);cursor:pointer;border-radius:999px;align-items:center;gap:8px;padding:6px 13px;font-size:12px;font-weight:600;display:inline-flex;box-shadow:0 8px 30px #00000040}.Uo1tjG_pill:hover{border-color:var(--tt-primary-border)}.Uo1tjG_pillCount{color:var(--tt-dim);font-variant-numeric:tabular-nums;font-weight:400}.Uo1tjG_pulse{background:var(--tt-cyan);width:6px;height:6px;box-shadow:0 0 0 4px var(--tt-cyan-soft), 0 0 12px #65d8c259;border-radius:50%;flex:none;animation:1.8s ease-in-out infinite Uo1tjG_pulse}@keyframes Uo1tjG_pulse{0%,to{opacity:1}50%{opacity:.35}}@media (prefers-reduced-motion:reduce){.Uo1tjG_pulse{animation:none}}.Uo1tjG_panel{border:1px solid var(--tt-border);background:linear-gradient(180deg, color-mix(in srgb, var(--dsw-alias-bg-overlay) 96%, var(--tt-primary) 4%), var(--dsw-alias-bg-overlay));border-radius:20px;flex-direction:column;width:384px;max-height:100%;display:flex;position:relative;overflow:hidden;box-shadow:0 25px 80px #00000059}.Uo1tjG_panel:before{content:\"\";pointer-events:none;background:radial-gradient(circle,#7b73ff24,#0000 68%);border-radius:50%;width:320px;height:320px;position:absolute;top:-130px;right:-120px}.Uo1tjG_head{border-bottom:1px solid var(--tt-border);flex:none;padding:16px 16px 13px;position:relative}.Uo1tjG_headRow{align-items:center;gap:10px;display:flex}.Uo1tjG_runIcon{background:var(--tt-primary-soft);border:1px solid var(--tt-primary-border);width:29px;height:29px;color:var(--tt-primary-text);border-radius:10px;flex:none;place-items:center;font-size:13px;display:grid}.Uo1tjG_runName{letter-spacing:-.015em;white-space:nowrap;text-overflow:ellipsis;font-size:13px;font-weight:700;overflow:hidden}.Uo1tjG_runId{color:var(--tt-dim);letter-spacing:.08em;text-transform:uppercase;white-space:nowrap;text-overflow:ellipsis;font:9px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;overflow:hidden}.Uo1tjG_headTitles{flex:1;min-width:0}.Uo1tjG_headActions{flex:none;gap:4px;display:flex}.Uo1tjG_tiny{width:27px;height:27px;color:var(--tt-dim);cursor:pointer;background:0 0;border:0;border-radius:8px;padding:0;font-size:13px;line-height:1}.Uo1tjG_tiny:hover{background:var(--tt-surface2);color:var(--dsw-alias-label-primary)}.Uo1tjG_statusRow{align-items:center;gap:9px;margin-top:14px;display:flex}.Uo1tjG_live{background:var(--tt-cyan-soft);border:1px solid var(--tt-cyan-border);color:var(--tt-cyan);border-radius:99px;align-items:center;gap:6px;padding:4px 9px;font-size:10px;font-weight:700;display:inline-flex}.Uo1tjG_idle{background:var(--tt-surface2);border:1px solid var(--tt-border);color:var(--tt-dim);border-radius:99px;align-items:center;gap:6px;padding:4px 9px;font-size:10px;font-weight:700;display:inline-flex}.Uo1tjG_elapsed{color:var(--tt-dim);font:10px/1 ui-monospace,monospace}.Uo1tjG_fraction{color:var(--tt-dim);margin-left:auto;font-size:11px}.Uo1tjG_fraction b{color:var(--dsw-alias-label-primary);letter-spacing:-.04em;font-size:17px;font-weight:750}.Uo1tjG_segments{gap:5px;margin-top:12px;display:flex}.Uo1tjG_segment{background:var(--tt-surface2);border-radius:99px;flex:1;height:4px;transition:background .4s}.Uo1tjG_segmentDone{background:var(--tt-cyan);box-shadow:0 0 10px #65d8c22e}.Uo1tjG_segmentRunning{background:var(--tt-primary);animation:1.8s ease-in-out infinite Uo1tjG_pulse;box-shadow:0 0 10px #7b73ff38}.Uo1tjG_segmentReview{background:var(--tt-amber)}.Uo1tjG_segmentCancelled{opacity:.35}.Uo1tjG_tools{border-bottom:1px solid var(--tt-border);flex:none;align-items:center;gap:5px;padding:9px 14px;display:flex}.Uo1tjG_filter{color:var(--tt-dim);cursor:pointer;background:0 0;border:none;border-radius:8px;padding:5px 9px;font-size:10.5px;font-weight:600}.Uo1tjG_filter:hover{color:var(--dsw-alias-label-primary)}.Uo1tjG_filterOn{background:var(--tt-surface2);color:var(--dsw-alias-label-primary)}.Uo1tjG_count{opacity:.55;margin-left:3px;font-weight:400}.Uo1tjG_toolSpacer{flex:1}.Uo1tjG_autoTag{color:var(--tt-dim);letter-spacing:.1em;font:700 8px/1 ui-monospace,monospace}.Uo1tjG_list{scrollbar-width:thin;flex:1;padding:11px 11px 14px;overflow-y:auto}.Uo1tjG_task{cursor:pointer;text-align:left;width:100%;color:inherit;font:inherit;background:0 0;border:1px solid #0000;border-radius:13px;margin-bottom:6px;padding:10px 11px 10px 44px;transition:background .2s,border-color .2s;display:block;position:relative}.Uo1tjG_task:hover{background:var(--tt-surface2);border-color:var(--tt-border)}.Uo1tjG_taskSelected{border-color:var(--tt-primary-border);box-shadow:inset 2px 0 var(--tt-primary);background:linear-gradient(135deg,#7b73ff1c,#65d8c209)}.Uo1tjG_node{border-radius:7px;place-items:center;width:20px;height:20px;font-size:10px;font-weight:600;display:grid;position:absolute;top:12px;left:13px}.Uo1tjG_nodeDone{background:var(--tt-cyan-soft);color:var(--tt-cyan);border:1px solid var(--tt-cyan-border)}.Uo1tjG_nodeRunning{background:var(--tt-primary-soft);color:var(--tt-primary-text);border:1px solid var(--tt-primary-border)}.Uo1tjG_nodeReview{color:var(--tt-amber);background:#ffb85c1f;border:1px solid #ffb85c40}.Uo1tjG_nodeQueued{background:var(--tt-surface2);color:var(--tt-dim);border:1px solid var(--tt-border)}.Uo1tjG_nodeCancelled{color:var(--tt-dim);border:1px dashed var(--tt-border);background:0 0}.Uo1tjG_line{background:var(--tt-border);width:1px;position:absolute;top:34px;bottom:-12px;left:23px}.Uo1tjG_taskTitle{align-items:center;gap:7px;min-width:0;font-size:12px;font-weight:650;display:flex}.Uo1tjG_taskKey{white-space:nowrap;text-overflow:ellipsis;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;overflow:hidden}.Uo1tjG_state{text-transform:uppercase;letter-spacing:.08em;color:var(--tt-dim);flex:none;font:700 8px/1 ui-monospace,monospace}.Uo1tjG_stateRun{color:var(--tt-primary-text)}.Uo1tjG_stateOk{color:var(--tt-cyan)}.Uo1tjG_stateWarn{color:var(--tt-amber)}.Uo1tjG_taskDesc{color:var(--tt-muted);white-space:nowrap;text-overflow:ellipsis;margin-top:3px;font-size:10.5px;overflow:hidden}.Uo1tjG_taskMeta{color:var(--tt-dim);align-items:center;gap:7px;margin-top:7px;font-size:9.5px;display:flex}.Uo1tjG_avatar{background:var(--tt-primary-soft);width:16px;height:16px;color:var(--tt-primary-text);border-radius:5px;flex:none;place-items:center;font-size:8px;font-weight:800;display:grid}.Uo1tjG_retry{color:var(--tt-amber);margin-left:auto;font-weight:700}.Uo1tjG_duration{margin-left:auto;font-family:ui-monospace,monospace}.Uo1tjG_waits{margin-left:auto}.Uo1tjG_inspector{border:1px solid var(--tt-primary-border);background:var(--dsw-alias-bg-layer-1);border-radius:14px;flex-direction:column;flex:none;max-height:220px;margin:0 11px 11px;display:flex;overflow:hidden}.Uo1tjG_inspectHead{border-bottom:1px solid var(--tt-border);flex:none;align-items:center;gap:8px;padding:10px 12px;display:flex}.Uo1tjG_inspectHead b{font-family:ui-monospace,monospace;font-size:11px}.Uo1tjG_inspectSub{color:var(--tt-dim);text-transform:uppercase;letter-spacing:.07em;font:8px/1.4 ui-monospace,monospace}.Uo1tjG_inspectClose{color:var(--tt-dim);cursor:pointer;background:0 0;border:none;border-radius:6px;margin-left:auto;padding:2px 6px;font-size:12px}.Uo1tjG_inspectClose:hover{background:var(--tt-surface2);color:var(--dsw-alias-label-primary)}.Uo1tjG_inspectBody{scrollbar-width:thin;flex-direction:column;gap:7px;padding:9px 12px 11px;display:flex;overflow-y:auto}.Uo1tjG_runLine{color:var(--tt-muted);align-items:baseline;gap:8px;font:10px/1.5 ui-monospace,monospace;display:flex}.Uo1tjG_runLine .Uo1tjG_ok{color:var(--tt-cyan)}.Uo1tjG_runLine .Uo1tjG_warn{color:var(--tt-amber)}.Uo1tjG_outputBlock{color:var(--tt-muted);background:var(--tt-surface2);white-space:pre-wrap;word-break:break-word;scrollbar-width:thin;border-radius:9px;max-height:96px;padding:8px 10px;font-size:10.5px;overflow-y:auto}.Uo1tjG_feedbackBlock{color:var(--tt-amber);white-space:pre-wrap;word-break:break-word;background:#ffb85c14;border-radius:9px;padding:8px 10px;font-size:10.5px}.Uo1tjG_attention{flex-direction:column;flex:none;gap:4px;padding:10px 14px 0;display:flex}.Uo1tjG_attentionReview{color:var(--tt-amber);background:#ffb85c1a;border-radius:9px;align-items:baseline;gap:7px;padding:6px 10px;font-size:11px;display:flex}.Uo1tjG_attentionMail{color:var(--tt-dim);border-radius:9px;align-items:baseline;gap:7px;padding:2px 10px;font-size:10.5px;display:flex}.Uo1tjG_foot{border-top:1px solid var(--tt-border);height:38px;color:var(--tt-dim);flex:none;align-items:center;gap:7px;padding:0 14px;font-size:9.5px;display:flex}.Uo1tjG_footModel{margin-left:auto;font-family:ui-monospace,monospace}";
		const tagId$1 = "@ready22race/dsh-team-task/Panel.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$1) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@ready22race/dsh-team-task";
			tag.dataset.pluginCss = tagId$1;
			tag.textContent = css$1;
			document.head.appendChild(tag);
		}
		var Panel_module_css_default = {
			"attention": "Uo1tjG_attention",
			"attentionMail": "Uo1tjG_attentionMail",
			"attentionReview": "Uo1tjG_attentionReview",
			"autoTag": "Uo1tjG_autoTag",
			"avatar": "Uo1tjG_avatar",
			"count": "Uo1tjG_count",
			"duration": "Uo1tjG_duration",
			"elapsed": "Uo1tjG_elapsed",
			"feedbackBlock": "Uo1tjG_feedbackBlock",
			"filter": "Uo1tjG_filter",
			"filterOn": "Uo1tjG_filterOn",
			"foot": "Uo1tjG_foot",
			"footModel": "Uo1tjG_footModel",
			"fraction": "Uo1tjG_fraction",
			"head": "Uo1tjG_head",
			"headActions": "Uo1tjG_headActions",
			"headRow": "Uo1tjG_headRow",
			"headTitles": "Uo1tjG_headTitles",
			"host": "Uo1tjG_host",
			"idle": "Uo1tjG_idle",
			"inspectBody": "Uo1tjG_inspectBody",
			"inspectClose": "Uo1tjG_inspectClose",
			"inspectHead": "Uo1tjG_inspectHead",
			"inspectSub": "Uo1tjG_inspectSub",
			"inspector": "Uo1tjG_inspector",
			"line": "Uo1tjG_line",
			"list": "Uo1tjG_list",
			"live": "Uo1tjG_live",
			"node": "Uo1tjG_node",
			"nodeCancelled": "Uo1tjG_nodeCancelled",
			"nodeDone": "Uo1tjG_nodeDone",
			"nodeQueued": "Uo1tjG_nodeQueued",
			"nodeReview": "Uo1tjG_nodeReview",
			"nodeRunning": "Uo1tjG_nodeRunning",
			"ok": "Uo1tjG_ok",
			"outputBlock": "Uo1tjG_outputBlock",
			"panel": "Uo1tjG_panel",
			"pill": "Uo1tjG_pill",
			"pillCount": "Uo1tjG_pillCount",
			"pulse": "Uo1tjG_pulse",
			"retry": "Uo1tjG_retry",
			"runIcon": "Uo1tjG_runIcon",
			"runId": "Uo1tjG_runId",
			"runLine": "Uo1tjG_runLine",
			"runName": "Uo1tjG_runName",
			"segment": "Uo1tjG_segment",
			"segmentCancelled": "Uo1tjG_segmentCancelled",
			"segmentDone": "Uo1tjG_segmentDone",
			"segmentReview": "Uo1tjG_segmentReview",
			"segmentRunning": "Uo1tjG_segmentRunning",
			"segments": "Uo1tjG_segments",
			"state": "Uo1tjG_state",
			"stateOk": "Uo1tjG_stateOk",
			"stateRun": "Uo1tjG_stateRun",
			"stateWarn": "Uo1tjG_stateWarn",
			"statusRow": "Uo1tjG_statusRow",
			"task": "Uo1tjG_task",
			"taskDesc": "Uo1tjG_taskDesc",
			"taskKey": "Uo1tjG_taskKey",
			"taskMeta": "Uo1tjG_taskMeta",
			"taskSelected": "Uo1tjG_taskSelected",
			"taskTitle": "Uo1tjG_taskTitle",
			"tiny": "Uo1tjG_tiny",
			"toolSpacer": "Uo1tjG_toolSpacer",
			"tools": "Uo1tjG_tools",
			"waits": "Uo1tjG_waits",
			"warn": "Uo1tjG_warn"
		};
		//#endregion
		//#region lib/client/Panel.js
		/**
		* The team-task board — V3 "right rail card" (approved mockup): run header
		* with Live chip / elapsed / big fraction, glowing per-node segments,
		* All·Active·Issues filters, node cards with icon rail + connector, a
		* click-to-inspect drawer (latest run, output excerpt, rework feedback),
		* and a footer status bar. Surfaces/text ride the host --dsw-alias-*
		* tokens; the violet/cyan/amber accents are the panel's identity.
		* @module team-task/client/panel
		*/
		/** Window event the conversation card fires to (re)open the board. */
		const OPEN_BOARD_EVENT = "team-task:open-board";
		function initialOf(name) {
			const first = [...name.trim()][0];
			return first === void 0 ? "?" : first.toUpperCase();
		}
		function formatElapsed(ms) {
			const total = Math.max(0, Math.floor(ms / 1e3));
			const h = Math.floor(total / 3600);
			const m = Math.floor(total % 3600 / 60);
			const s = total % 60;
			const p = (n) => String(n).padStart(2, "0");
			return h > 0 ? `${h}:${p(m)}:${p(s)}` : `${p(m)}:${p(s)}`;
		}
		function segmentClass(node) {
			const base = Panel_module_css_default.segment ?? "";
			switch (node.status) {
				case "approved": return `${base} ${Panel_module_css_default.segmentDone}`;
				case "running":
				case "dispatched": return `${base} ${Panel_module_css_default.segmentRunning}`;
				case "awaiting_review": return `${base} ${Panel_module_css_default.segmentReview}`;
				case "cancelled": return `${base} ${Panel_module_css_default.segmentCancelled}`;
				default: return base;
			}
		}
		function nodeIcon(node, index) {
			switch (node.status) {
				case "approved": return {
					className: `${Panel_module_css_default.node} ${Panel_module_css_default.nodeDone}`,
					glyph: "✓"
				};
				case "running":
				case "dispatched": return {
					className: `${Panel_module_css_default.node} ${Panel_module_css_default.nodeRunning}`,
					glyph: "⌁"
				};
				case "awaiting_review": return {
					className: `${Panel_module_css_default.node} ${Panel_module_css_default.nodeReview}`,
					glyph: "!"
				};
				case "cancelled": return {
					className: `${Panel_module_css_default.node} ${Panel_module_css_default.nodeCancelled}`,
					glyph: "×"
				};
				default: return {
					className: `${Panel_module_css_default.node} ${Panel_module_css_default.nodeQueued}`,
					glyph: String(index + 1)
				};
			}
		}
		function stateLabel(node) {
			const outcome = node.runs.at(-1)?.outcome;
			switch (node.status) {
				case "approved": return {
					text: "done",
					className: `${Panel_module_css_default.state} ${Panel_module_css_default.stateOk}`
				};
				case "running": return {
					text: "running",
					className: `${Panel_module_css_default.state} ${Panel_module_css_default.stateRun}`
				};
				case "dispatched": return {
					text: "dispatched",
					className: `${Panel_module_css_default.state} ${Panel_module_css_default.stateRun}`
				};
				case "awaiting_review": return outcome === "completed" ? {
					text: "review",
					className: `${Panel_module_css_default.state} ${Panel_module_css_default.stateWarn}`
				} : {
					text: "unclaimed",
					className: `${Panel_module_css_default.state} ${Panel_module_css_default.stateWarn}`
				};
				case "cancelled": return {
					text: "cancelled",
					className: Panel_module_css_default.state ?? ""
				};
				default: return node.dependsOn.length > 0 ? {
					text: "blocked",
					className: Panel_module_css_default.state ?? ""
				} : {
					text: "queued",
					className: Panel_module_css_default.state ?? ""
				};
			}
		}
		function runDuration(node, now) {
			const run = node.runs.at(-1);
			if (run === void 0) return void 0;
			const end = run.settledAt ?? (node.status === "running" ? now : void 0);
			if (end === void 0) return void 0;
			return formatElapsed(end - run.startedAt);
		}
		function isIssue(node) {
			return node.status === "awaiting_review" || node.attempts > 1;
		}
		function isActive(node) {
			return node.status === "running" || node.status === "dispatched";
		}
		function TaskRow({ node, index, now, isLast, selected, onSelect }) {
			const icon = nodeIcon(node, index);
			const state = stateLabel(node);
			const duration = runDuration(node, now);
			const blocked = node.status === "pending" && node.dependsOn.length > 0;
			return (0, react_jsx_runtime.jsxs)("button", {
				type: "button",
				className: `${Panel_module_css_default.task} ${selected ? Panel_module_css_default.taskSelected : ""}`,
				onClick: onSelect,
				children: [
					(0, react_jsx_runtime.jsx)("i", {
						className: icon.className,
						children: icon.glyph
					}),
					!isLast && (0, react_jsx_runtime.jsx)("i", { className: Panel_module_css_default.line }),
					(0, react_jsx_runtime.jsxs)("div", {
						className: Panel_module_css_default.taskTitle,
						children: [(0, react_jsx_runtime.jsx)("span", {
							className: Panel_module_css_default.taskKey,
							children: node.key
						}), (0, react_jsx_runtime.jsx)("span", {
							className: state.className,
							children: state.text
						})]
					}),
					(0, react_jsx_runtime.jsx)("div", {
						className: Panel_module_css_default.taskDesc,
						title: node.goal ?? node.title,
						children: node.title
					}),
					(0, react_jsx_runtime.jsxs)("div", {
						className: Panel_module_css_default.taskMeta,
						children: [node.assignee !== void 0 && (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [(0, react_jsx_runtime.jsx)("i", {
							className: Panel_module_css_default.avatar,
							children: initialOf(node.assignee)
						}), node.assignee] }), node.attempts > 1 ? (0, react_jsx_runtime.jsxs)("span", {
							className: Panel_module_css_default.retry,
							children: ["attempt ", node.attempts]
						}) : blocked ? (0, react_jsx_runtime.jsxs)("span", {
							className: Panel_module_css_default.waits,
							children: ["waits ", node.dependsOn.join(", ")]
						}) : duration !== void 0 && (0, react_jsx_runtime.jsx)("span", {
							className: Panel_module_css_default.duration,
							children: duration
						})]
					})
				]
			});
		}
		function Inspector({ node, members, onClose, openSession }) {
			node.runs.at(-1);
			const member = members.find((m) => m.name === node.assignee);
			return (0, react_jsx_runtime.jsxs)("div", {
				className: Panel_module_css_default.inspector,
				children: [(0, react_jsx_runtime.jsxs)("div", {
					className: Panel_module_css_default.inspectHead,
					children: [(0, react_jsx_runtime.jsxs)("div", { children: [(0, react_jsx_runtime.jsx)("b", { children: node.key }), (0, react_jsx_runtime.jsxs)("div", {
						className: Panel_module_css_default.inspectSub,
						children: [
							node.status,
							" · attempt ",
							Math.max(node.attempts, 1),
							" · fence ",
							node.fence
						]
					})] }), (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: Panel_module_css_default.inspectClose,
						onClick: onClose,
						children: "×"
					})]
				}), (0, react_jsx_runtime.jsxs)("div", {
					className: Panel_module_css_default.inspectBody,
					children: [
						node.runs.map((r) => (0, react_jsx_runtime.jsxs)("div", {
							className: Panel_module_css_default.runLine,
							children: [
								(0, react_jsx_runtime.jsxs)("span", { children: ["#", r.fence] }),
								(0, react_jsx_runtime.jsx)("span", { children: r.memberName }),
								(0, react_jsx_runtime.jsx)("span", {
									className: r.outcome === "completed" ? "ok" : r.outcome === void 0 ? "" : "warn",
									children: r.outcome ?? "open"
								}),
								r.settledBy !== void 0 && (0, react_jsx_runtime.jsxs)("span", { children: ["via ", r.settledBy] }),
								r.settledAt !== void 0 && (0, react_jsx_runtime.jsx)("span", { children: formatElapsed(r.settledAt - r.startedAt) })
							]
						}, r.fence)),
						node.feedback !== void 0 && (0, react_jsx_runtime.jsxs)("div", {
							className: Panel_module_css_default.feedbackBlock,
							children: ["rework: ", node.feedback]
						}),
						node.output !== void 0 && (0, react_jsx_runtime.jsx)("div", {
							className: Panel_module_css_default.outputBlock,
							children: node.output
						}),
						member !== void 0 && member.sessionId !== "" && (0, react_jsx_runtime.jsx)("div", {
							className: Panel_module_css_default.runLine,
							children: (0, react_jsx_runtime.jsxs)("span", {
								style: {
									cursor: "pointer",
									textDecoration: "underline"
								},
								onClick: () => openSession(member.sessionId),
								children: [
									"open ",
									member.name,
									"'s session →"
								]
							})
						})
					]
				})]
			});
		}
		/** The floater. Board ↔ pill (–) ↔ hidden (×); session-follow. */
		function Panel({ sessionsList, openSession }) {
			const [tasks, setTasks] = (0, react.useState)([]);
			const [mode, setMode] = (0, react.useState)("pill");
			const [autoOpenedFor, setAutoOpenedFor] = (0, react.useState)("");
			const [filter, setFilter] = (0, react.useState)("all");
			const [selectedKey, setSelectedKey] = (0, react.useState)();
			const [now, setNow] = (0, react.useState)(() => Date.now());
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
					setNow(Date.now());
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
					setSelectedKey(void 0);
					setFilter("all");
				}
			}, [task, autoOpenedFor]);
			if (task === void 0 || mode === "hidden") return null;
			const progress = progressOf(task.state);
			const anyRunning = Object.values(task.activity).includes("running");
			const members = task.state.members.filter((m) => m.retired !== true);
			const nodes = task.state.nodes;
			const activeCount = nodes.filter(isActive).length;
			const issueCount = nodes.filter(isIssue).length;
			const queuedMail = task.state.messages.filter((m) => m.deliveredAt === void 0);
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
			const visible = nodes.filter((n) => filter === "all" ? true : filter === "active" ? isActive(n) : isIssue(n));
			const selected = selectedKey === void 0 ? void 0 : nodes.find((n) => n.key === selectedKey);
			const elapsedMs = (task.state.finishedAt ?? now) - task.state.createdAt;
			const runningCount = Object.values(task.activity).filter((a) => a === "running").length;
			return (0, react_jsx_runtime.jsx)("div", {
				className: Panel_module_css_default.host,
				children: (0, react_jsx_runtime.jsxs)("section", {
					className: Panel_module_css_default.panel,
					"data-team-task-board": true,
					children: [
						(0, react_jsx_runtime.jsxs)("header", {
							className: Panel_module_css_default.head,
							children: [
								(0, react_jsx_runtime.jsxs)("div", {
									className: Panel_module_css_default.headRow,
									children: [
										(0, react_jsx_runtime.jsx)("div", {
											className: Panel_module_css_default.runIcon,
											children: "⌁"
										}),
										(0, react_jsx_runtime.jsxs)("div", {
											className: Panel_module_css_default.headTitles,
											children: [(0, react_jsx_runtime.jsx)("div", {
												className: Panel_module_css_default.runName,
												title: task.state.goal,
												children: task.state.name
											}), (0, react_jsx_runtime.jsx)("div", {
												className: Panel_module_css_default.runId,
												children: task.state.id
											})]
										}),
										(0, react_jsx_runtime.jsxs)("div", {
											className: Panel_module_css_default.headActions,
											children: [(0, react_jsx_runtime.jsx)("button", {
												type: "button",
												className: Panel_module_css_default.tiny,
												title: "收起",
												onClick: () => setMode("pill"),
												children: "—"
											}), (0, react_jsx_runtime.jsx)("button", {
												type: "button",
												className: Panel_module_css_default.tiny,
												title: "关闭",
												onClick: () => setMode("hidden"),
												children: "×"
											})]
										})
									]
								}),
								(0, react_jsx_runtime.jsxs)("div", {
									className: Panel_module_css_default.statusRow,
									children: [
										task.state.finishedAt !== void 0 ? (0, react_jsx_runtime.jsx)("span", {
											className: Panel_module_css_default.idle,
											children: task.state.finishStatus
										}) : anyRunning ? (0, react_jsx_runtime.jsxs)("span", {
											className: Panel_module_css_default.live,
											children: [(0, react_jsx_runtime.jsx)("i", { className: Panel_module_css_default.pulse }), "Live"]
										}) : (0, react_jsx_runtime.jsx)("span", {
											className: Panel_module_css_default.idle,
											children: "Waiting"
										}),
										(0, react_jsx_runtime.jsxs)("span", {
											className: Panel_module_css_default.elapsed,
											children: [formatElapsed(elapsedMs), " elapsed"]
										}),
										(0, react_jsx_runtime.jsxs)("span", {
											className: Panel_module_css_default.fraction,
											children: [
												(0, react_jsx_runtime.jsx)("b", { children: progress.done }),
												" / ",
												progress.total
											]
										})
									]
								}),
								(0, react_jsx_runtime.jsx)("div", {
									className: Panel_module_css_default.segments,
									children: nodes.map((node) => (0, react_jsx_runtime.jsx)("i", {
										className: segmentClass(node),
										title: `${node.key} · ${node.status}`
									}, node.key))
								})
							]
						}),
						(0, react_jsx_runtime.jsxs)("div", {
							className: Panel_module_css_default.tools,
							children: [
								(0, react_jsx_runtime.jsxs)("button", {
									type: "button",
									className: `${Panel_module_css_default.filter} ${filter === "all" ? Panel_module_css_default.filterOn : ""}`,
									onClick: () => setFilter("all"),
									children: ["All", (0, react_jsx_runtime.jsx)("span", {
										className: Panel_module_css_default.count,
										children: nodes.length
									})]
								}),
								(0, react_jsx_runtime.jsxs)("button", {
									type: "button",
									className: `${Panel_module_css_default.filter} ${filter === "active" ? Panel_module_css_default.filterOn : ""}`,
									onClick: () => setFilter("active"),
									children: ["Active", (0, react_jsx_runtime.jsx)("span", {
										className: Panel_module_css_default.count,
										children: activeCount
									})]
								}),
								(0, react_jsx_runtime.jsxs)("button", {
									type: "button",
									className: `${Panel_module_css_default.filter} ${filter === "issues" ? Panel_module_css_default.filterOn : ""}`,
									onClick: () => setFilter("issues"),
									children: ["Issues", (0, react_jsx_runtime.jsx)("span", {
										className: Panel_module_css_default.count,
										children: issueCount
									})]
								}),
								(0, react_jsx_runtime.jsx)("span", { className: Panel_module_css_default.toolSpacer }),
								(0, react_jsx_runtime.jsx)("span", {
									className: Panel_module_css_default.autoTag,
									children: "EVENT LOG"
								})
							]
						}),
						queuedMail.length > 0 && (0, react_jsx_runtime.jsx)("div", {
							className: Panel_module_css_default.attention,
							children: queuedMail.slice(0, 3).map((message) => (0, react_jsx_runtime.jsxs)("span", {
								className: Panel_module_css_default.attentionMail,
								children: [
									"✉ ",
									message.from,
									" → ",
									message.to,
									" · queued for the next turn"
								]
							}, message.id))
						}),
						(0, react_jsx_runtime.jsx)("div", {
							className: Panel_module_css_default.list,
							children: visible.map((node) => (0, react_jsx_runtime.jsx)(TaskRow, {
								node,
								index: nodes.indexOf(node),
								now,
								isLast: node === visible.at(-1),
								selected: node.key === selectedKey,
								onSelect: () => setSelectedKey(node.key === selectedKey ? void 0 : node.key)
							}, node.key))
						}),
						selected !== void 0 && (0, react_jsx_runtime.jsx)(Inspector, {
							node: selected,
							members,
							onClose: () => setSelectedKey(void 0),
							openSession
						}),
						(0, react_jsx_runtime.jsxs)("footer", {
							className: Panel_module_css_default.foot,
							children: [(0, react_jsx_runtime.jsxs)("span", { children: [
								"● ",
								members.length,
								" members",
								runningCount > 0 ? ` · ${runningCount} running` : ""
							] }), (0, react_jsx_runtime.jsx)("span", {
								className: Panel_module_css_default.footModel,
								children: members.find((m) => m.model !== void 0)?.model ?? "inherited route"
							})]
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