/**
 * A stand-in for an external data source.
 *
 * The document only stores a user id. Everything shown in the chip is
 * resolved from here when it renders, which is what makes an inline node
 * different from ordinary text: change a name below and every mention in
 * the document updates, with no edit to the document at all.
 */
export type DirectoryEntry = {
	name: string;
	colour: string;
};

export const mention_directory: Record<string, DirectoryEntry> = {
	michael: { name: 'Michael', colour: 'oklch(70% 0.15 250)' },
	johannes: { name: 'Johannes', colour: 'oklch(70% 0.15 150)' },
	michele: { name: 'Michele', colour: 'oklch(70% 0.15 30)' }
};

export const mention_user_ids = Object.keys(mention_directory);
