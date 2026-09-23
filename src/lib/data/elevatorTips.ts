/** Shown one at a time on the elevator ride up to the floor. Short, in the desk's own
 * "Discipline / Research / Returns" voice - process reminders, not price predictions. */
export const ELEVATOR_TIPS: string[] = [
	'Size down before you are forced to.',
	'A stop is not a suggestion.',
	'The setup you skip is the one that works.',
	'Confluence beats conviction.',
	'Plan the exit before the entry.',
	'Boredom is not a signal.',
	'Hope is not a hedge.',
	'Cut losers fast, let winners run.',
	'Revenge size is how books die quietly.',
	'The trend is your friend until the close.',
	'Risk is what you pay to find out if you were right.',
	'No fill beats a bad fill.',
	'Journal the loss, not just the win.',
	'Leverage amplifies discipline and its absence equally.',
	'If the thesis breaks, the position is wrong now.',
	'Averaging into strength is a plan. Averaging into hope is not.',
	'Small size, strong opinions. Not the other way around.',
	'The tape does not know your entry price.',
	'Every desk has a bad week. Few have a bad process.',
	'Sit on your hands is also a position.'
];

export function randomElevatorTip(): string {
	return ELEVATOR_TIPS[Math.floor(Math.random() * ELEVATOR_TIPS.length)];
}
