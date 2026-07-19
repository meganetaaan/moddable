/*
 * Copyright (c) 2026 Moddable Tech, Inc.
 *
 *   This file is part of the Moddable SDK Tools.
 *
 *   This file is free software: you can redistribute it and/or modify
 *   it under the terms of the GNU General Public License as published by
 *   the Free Software Foundation, either version 3 of the License, or
 *   (at your option) any later version.
 *
 *   This file is distributed in the hope that it will be useful,
 *   but WITHOUT ANY WARRANTY; without even the implied warranty of
 *   MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 *   GNU General Public License for more details.
 *
 *   You should have received a copy of the GNU General Public License
 *   along with this file. If not, see <http://www.gnu.org/licenses/>.
 */

#include "piuPC.h"

static GtkWindow* mcsim_lite_get_window(xsMachine* the)
{
	PiuApplication* application = PIU(Application, xsArg(0));
	PiuView* view = (*application)->view;
	return (*view)->gtkWindow;
}

void mcsim_lite_get_workarea(xsMachine* the)
{
	GtkWindow* window = mcsim_lite_get_window(the);
	GtkWidget* widget = GTK_WIDGET(window);
	GdkDisplay* display = gtk_widget_get_display(widget);
	GdkMonitor* monitor = NULL;
	GdkRectangle area = { 0, 0, 1280, 800 };
	GdkWindow* gdkWindow = gtk_widget_get_window(widget);

	if (display) {
		if (gdkWindow)
			monitor = gdk_display_get_monitor_at_window(display, gdkWindow);
		if (!monitor)
			monitor = gdk_display_get_primary_monitor(display);
		if (monitor)
			gdk_monitor_get_workarea(monitor, &area);
	}

	xsResult = xsNewObject();
	xsSet(xsResult, xsID_width, xsInteger(area.width));
	xsSet(xsResult, xsID_height, xsInteger(area.height));
}

void mcsim_lite_resize_window(xsMachine* the)
{
	GtkWindow* window = mcsim_lite_get_window(the);
	gint width = xsToInteger(xsArg(1));
	gint height = xsToInteger(xsArg(2));

	if (width < 1)
		width = 1;
	if (height < 1)
		height = 1;
	gtk_window_unmaximize(window);
	gtk_window_set_default_size(window, width, height);
	gtk_window_resize(window, width, height);
}
