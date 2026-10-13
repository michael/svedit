import type { ReactNode } from 'react';
import '@svedit/demo-shared/styles/reset.css';
import '@svedit/demo-shared/styles/typography.css';
import '../styles/colors.css';
import '@svedit/demo-shared/styles/spacing.css';
import '@svedit/demo-shared/styles/shadows.css';
import '@svedit/demo-shared/styles/annotations.css';
import FrameworkSwitcher from './FrameworkSwitcher.js';

export default function Layout({ children }: { children?: ReactNode }) {
	return (
		<>
			<FrameworkSwitcher />
			<div className="layout-container">{children}</div>
		</>
	);
}
