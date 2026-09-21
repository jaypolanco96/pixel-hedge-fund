/** Desk primers - original educational copy for diegetic book spines. */

export type DeskBookId =
	| 'securities-analysis'
	| 'technical-analysis'
	| 'options-strategies'
	| 'intelligent-investor';

export interface DeskBook {
	id: DeskBookId;
	/** Matches the decorative spine label (spaces, no line breaks). */
	spineTitle: string;
	/** Short readable screens; hard cap 5. */
	pages: string[];
}

export const DESK_LIBRARY: DeskBook[] = [
	{
		id: 'securities-analysis',
		spineTitle: 'SECURITIES ANALYSIS',
		pages: [
			`Desk primer - Securities Analysis. Before you size a crypto leg, treat the instrument like a claim on cash flows and collateral, not a ticker on a screen. Ask: what settles this contract, who can change the rules overnight, and how fast can liquidity vanish when the tape gaps. Write the thesis in one sentence a junior can repeat without jargon. If you cannot, you are trading vibes - and vibes do not survive a funding squeeze or a venue outage during your max pain hour. Keep the sentence taped near the CRT until the trade is flat.`,
			`Balance-sheet thinking still matters on perpetual futures. Map open interest, funding, and venue concentration the way an equity desk maps float, borrow, and short interest. Prefer venues and products you can reconcile end-to-end: mark price, margin mode, liquidation engine, fee schedule, and withdrawal path. A clean book beats a clever narrative when the floor is under stress and the CIO asks for a one-pager before the next risk meeting. If you cannot explain the product plumbing, you do not own the risk - the venue does.`,
			`Risk units first, conviction second. Cap notional so a two-sigma adverse move leaves the fund able to trade tomorrow without a capital call. Separate research edge (why price should move) from execution edge (how you get filled without donating the spread and without chasing). Log assumptions in the desk notes; revise them when the tape proves you wrong - quietly, without revenge size or a whispered "one more add." The best securities work on this floor is often the trade you declined.`,
			`Checklist before click: thesis sentence, invalidation level, max loss in dollars, venue and product confirmed, funding or borrow known, and who covers if you step away. If any box fails, flat is a position. Securities analysis on this desk means disciplined curiosity - not endless PDFs without a decision rule, and never inventing live market numbers to justify a gut feel. Print the checklist once; follow it every time the stack of books stares back at you. Log the decision so the next shift can audit it.`
		]
	},
	{
		id: 'technical-analysis',
		spineTitle: 'TECHNICAL ANALYSIS',
		pages: [
			`Desk primer - Technical Analysis. TA here is a language for risk and timing, not prophecy. Start with market structure: higher highs and higher lows versus the opposite, plus where the last acceptance lived. Mark swing levels the whole floor can see on the CRT. Bias follows structure; entries wait for a trigger you defined in advance - reclaim, break-and-hold, or failed auction - not the last green candle in a chat thread or a social feed. If the level is not shareable, it is not a desk level.`,
			`Confluence over clutter. Pair one higher timeframe for trend with one lower timeframe for execution. Add volume or open-interest context when it clarifies participation, not to decorate the chart with toys. Indicators are filters: if RSI, MACD, and three moving averages disagree, you do not need a fourth overlay - you need smaller size, a structure-based stop with less leverage, or no trade at all this session. Clarity beats a rainbow of studies every single time. Risk signed the plan; follow the plan.`,
			`Stops belong to structure, not hope. Place them where the thesis breaks: failed breakout, broken swing, rejected reclaim of a level the desk agreed mattered. Targets scale with range - take partials at measured moves, trail only after follow-through proves the move. Avoid averaging into noise unless the written plan said so before the first fill hit the blotter and risk already sized the path. Hope is not a hedge; it is how books quietly die. Curiosity is fine - revenge size is not.`,
			`Crypto wrinkle: weekend thin books, venue gaps, and funding flips can invalidate textbook patterns in an hour. Prefer levels that held across sessions and across the venues you actually trade. When volatility expands, widen stops and shrink size together - never widen size to "make room for the stop." Flat after a failed setup is a win for tomorrow's capital and for your sleep. The chart does not owe you a second chance. Close the session with notes, not with hope.`,
			`Ritual before you send: annotate bias, trigger, stop, and two targets on the desk CRT in language a PM can audit. If the tape changes, update the note - do not silently rewrite the plan mid-fill. Technical analysis without a ritual is just screen watching with better fonts. When in doubt, reduce size first, then argue with the chart later over coffee. Keep the checklist visible on the desk. Process beats impulse when the tape is loud. Smaller size is always an allowed answer.`
		]
	},
	{
		id: 'options-strategies',
		spineTitle: 'OPTIONS STRATEGIES',
		pages: [
			`Desk primer - Options Strategies. Think in payoffs and Greeks before tickers. Calls and puts are insurance contracts with an expiry clock and a volatility surface attached. Defined-risk structures - debit spreads, credit spreads, collars - beat naked short volatility when you cannot sit the full gap. On crypto desks, treat venue options and synthetic futures-option hybrids as different products with different failure modes, margin rules, and settlement quirks. Name the product correctly before you size it. Log the decision so the next shift can audit it.`,
			`Volatility is the inventory. Selling premium needs a plan for gap risk, weekend events, and margin calls; buying premium needs a thesis on why the move arrives before theta eats the ticket and why implied is not already pricing your story. Match horizon to days-to-expiry. A weekend catalyst belongs in a structure that survives Saturday, not a Friday lottery ticket sized like a conviction futures long. If you are guessing the expiry, you are guessing the trade. If unsure, stay flat and wait for structure.`,
			`Floor-ready shapes: debit spreads express direction with capped loss; credit spreads harvest range with capped pain if the wings are defined; collars protect a spot or futures book without abandoning all upside. Iron butterflies and calendars can wait until the first three are second nature. Avoid stacking high leverage in the underlying and short vol at the same time unless risk has signed off in writing on notional and scenario loss. Two levers pulled together is how quiet desks become loud.`,
			`Execution hygiene: know settlement (cash vs coin), exercise and assignment rules, and how the venue marks implied vol into margin. Size so maximum loss is a known dollar number before you click confirm. If you cannot draw the payoff on a napkin in thirty seconds, do not trade it live. Flat is allowed; complexity is not a badge of honor on this floor. Keep the napkin. Audit yourself next week. Curiosity is fine - revenge size is not. Close the session with notes, not with hope.`
		]
	},
	{
		id: 'intelligent-investor',
		spineTitle: 'INTELLIGENT INVESTOR',
		pages: [
			`Desk primer - Intelligent Investor (homage). This spine is not a reprint of anyone's classic. It is our floor's reminder: price is what you pay; value is what you keep after fees, funding, slippage, and forced liquidations. Margin of safety means leaving deliberate room between your entry and ruin - in dollars at risk, leverage chosen, theme concentration, and calendar time you can actually wait. Safety is a number you can write, not a feeling after a green day. Keep the checklist visible on the desk.`,
			`Long-term discipline on a twenty-four-seven tape sounds paradoxical until you translate it for the desk: fewer impulsive flips, written invalidations, and a bias toward surviving drawdowns so you can still show up next week with dry powder. Compounding only works if the account stays open. Celebrate boring process - sized risk, checked venue health, logged rationale - over clever one-off hero trades that look brilliant in a screenshot. Screenshots do not pay next month's variance. Process beats impulse when the tape is loud.`,
			`The market still shouts through funding spikes, influencer candles, and liquidation cascades. Those are invitations to overtrade and to abandon the plan you wrote when you were calm. Answer with rules: max daily loss, max concurrent themes, cool-down after a stop-out, and a hard ban on "just this once" size. Intelligence here is emotional control dressed as procedure the whole floor can see. If the rule only applies when you feel like it, it is not a rule. Smaller size is always an allowed answer.`,
			`Build a personal margin-of-safety stack: conservative leverage defaults, diversified venue risk where practical, a cash buffer for real opportunities, and a weekly review that asks what we learned - not why we were not max long into every bounce. The homage ends where curiosity and humility begin, every session, with original desk language and no quoted paragraphs from anyone else's pages. Close the book when the checklist is done, not when the chart flatters you. Log the decision so the next shift can audit it.`
		]
	}
];

export function getDeskBook(id: DeskBookId | null | undefined): DeskBook | null {
	if (!id) return null;
	return DESK_LIBRARY.find((b) => b.id === id) ?? null;
}

export function bookIdForSpineTitle(title: string): DeskBookId | null {
	const norm = title.replace(/\s+/g, ' ').trim().toUpperCase();
	const hit = DESK_LIBRARY.find((b) => b.spineTitle === norm);
	return hit?.id ?? null;
}
