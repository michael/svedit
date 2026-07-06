import {
	SelectAllCommand,
	InsertDefaultNodeCommand,
	AddNewLineCommand,
	BreakTextNodeCommand,
	UndoCommand,
	RedoCommand,
	SelectParentCommand
} from 'svedit';
import { CycleLayoutCommand, CycleNodeTypeCommand } from '../../commands.svelte.js';

// App-level editing commands and their keybindings, independent of any
// specific node type.
export default {
	name: 'core',
	commands: (context) => ({
		select_all: new SelectAllCommand(context),
		insert_default_node: new InsertDefaultNodeCommand(context),
		add_new_line: new AddNewLineCommand(context),
		break_text_node: new BreakTextNodeCommand(context),
		undo: new UndoCommand(context),
		redo: new RedoCommand(context),
		select_parent: new SelectParentCommand(context),
		next_layout: new CycleLayoutCommand('next', context),
		previous_layout: new CycleLayoutCommand('previous', context),
		next_type: new CycleNodeTypeCommand('next', context),
		previous_type: new CycleNodeTypeCommand('previous', context)
	}),
	keymap: {
		'meta+a,ctrl+a': ['select_all'],
		enter: ['break_text_node', 'add_new_line', 'insert_default_node'],
		'shift+enter': ['add_new_line'],
		'meta+z,ctrl+z': ['undo'],
		'meta+shift+z,ctrl+shift+z': ['redo'],
		escape: ['select_parent'],
		'ctrl+shift+arrowright': ['next_layout'],
		'ctrl+shift+arrowleft': ['previous_layout'],
		'ctrl+shift+arrowdown': ['next_type'],
		'ctrl+shift+arrowup': ['previous_type']
	}
};
