/*
 * Copyright (c) 2024-2026  Moddable Tech, Inc.
 *
 *   This file is part of the Moddable SDK Runtime.
 * 
 *   The Moddable SDK Runtime is free software: you can redistribute it and/or modify
 *   it under the terms of the GNU Lesser General Public License as published by
 *   the Free Software Foundation, either version 3 of the License, or
 *   (at your option) any later version.
 * 
 *   The Moddable SDK Runtime is distributed in the hope that it will be useful,
 *   but WITHOUT ANY WARRANTY; without even the implied warranty of
 *   MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *   GNU Lesser General Public License for more details.
 * 
 *   You should have received a copy of the GNU Lesser General Public License
 *   along with the Moddable SDK Runtime.  If not, see <http://www.gnu.org/licenses/>.
 *
 */
 
#include "xsmc.h"
#include "xsHost.h"
#include "mc.xs.h"      // for xsID_ values

#include <sys/types.h>
#include <sys/stat.h>
#include <dirent.h>
#include <errno.h>
#include <fcntl.h>
#include <string.h>
#include <unistd.h>

#if ESP32
	#include "mc.defines.h"
	#include "driver/sdmmc_host.h"
	#include "esp_vfs_fat.h"
	#include "sd_pwr_ctrl_by_on_chip_ldo.h"
#else
	#include <pwd.h>
#endif

#define kCreateFilePermissions (0666)
#define kCreateDirectoryPermissions (0777)
#define kOpenDirFlags (O_RDONLY)

#ifndef AT_SYMLINK_NOFOLLOW
	#define AT_SYMLINK_NOFOLLOW 0
#endif

/*
	helpers
*/

#define throwIf(a) if ((a) < 0) xsUnknownError(strerror(errno))

#define getPath(s) _getPath(the, &s)

enum {
	kPathStateAny,
	kPathStateSlash,
	kPathStateDot,
	kPathStateDotDot,
};

static char *_getPath(xsMachine *the, xsSlot *slot)
{
	char *path = xsmcToString(*slot);
	char *p = path;
	int state = kPathStateSlash;

	if (0 == c_read8(p)) {
		xsmcSetStringX(*slot, "./");
		return xsmcToString(*slot);
	}

	while (true) {
		switch (c_read8(p++)) {
			case '.': 
				if (kPathStateSlash == state)
					state = kPathStateDot;
				else if (kPathStateDot == state)
					state = kPathStateDotDot;
				else
					state = 0;
				break;
			case '/':
				if ((kPathStateSlash == state) || (kPathStateDot == state) || (kPathStateDotDot == state))
					xsUnknownError("bad path");
				state = kPathStateSlash;
				break;
			case 0:
				if ((kPathStateDot == state) || (kPathStateDotDot == state))
					xsUnknownError("bad path");
				return path;
			default:
				state = kPathStateAny;
				break;
		}
	}

	return NULL;		// can never reach here
}

#if ESP32

#ifndef MODDEF_FILE_SDMMC_SLOT
	#define MODDEF_FILE_SDMMC_SLOT SDMMC_HOST_SLOT_0
#endif
#ifndef MODDEF_FILE_SDMMC_WIDTH
	#define MODDEF_FILE_SDMMC_WIDTH 4
#endif
#ifndef MODDEF_FILE_SDMMC_MAX_FILES
	#define MODDEF_FILE_SDMMC_MAX_FILES 5
#endif
#ifndef MODDEF_FILE_SDMMC_LDO
	#define MODDEF_FILE_SDMMC_LDO 4
#endif

static sdmmc_card_t *gCard;
static sd_pwr_ctrl_handle_t gPower;

static void mountSDCard(xsMachine *the, const char *path)
{
	if (gCard)
		return;

	esp_err_t result;
	if (!gPower) {
		sd_pwr_ctrl_ldo_config_t powerConfig = {
			.ldo_chan_id = MODDEF_FILE_SDMMC_LDO
		};
		result = sd_pwr_ctrl_new_on_chip_ldo(&powerConfig, &gPower);
		if (ESP_OK != result)
			xsUnknownError("SD card power failed: 0x%x", result);
	}

	sdmmc_host_t host = SDMMC_HOST_DEFAULT();
	host.slot = MODDEF_FILE_SDMMC_SLOT;
	host.max_freq_khz = SDMMC_FREQ_HIGHSPEED;
	host.pwr_ctrl_handle = gPower;

	sdmmc_slot_config_t slot = SDMMC_SLOT_CONFIG_DEFAULT();
	slot.width = MODDEF_FILE_SDMMC_WIDTH;
	slot.clk = MODDEF_FILE_SDMMC_CLK;
	slot.cmd = MODDEF_FILE_SDMMC_CMD;
	slot.d0 = MODDEF_FILE_SDMMC_D0;
	slot.d1 = MODDEF_FILE_SDMMC_D1;
	slot.d2 = MODDEF_FILE_SDMMC_D2;
	slot.d3 = MODDEF_FILE_SDMMC_D3;

	esp_vfs_fat_sdmmc_mount_config_t mount = {
		.format_if_mount_failed = false,
		.max_files = MODDEF_FILE_SDMMC_MAX_FILES,
		.allocation_unit_size = 16 * 1024
	};
	result = esp_vfs_fat_sdmmc_mount(path, &host, &slot, &mount, &gCard);
	if (ESP_OK != result)
		xsUnknownError("SD card mount failed: 0x%x", result);
}

#else

#if mxLinux
#include <linux/openat2.h>
#include <sys/syscall.h>

static int do_openat2(int dirfd, const char *pathname, int flags)
{
	struct open_how how = {0};
	how.flags = flags;
	how.mode = 0;
	how.resolve = RESOLVE_BENEATH;
	return syscall(SYS_openat2, dirfd, pathname, &how, sizeof(how));
}
#else /* !mxLinux */
static int do_openat2(int dirfd, const char *pathname, int flags)
{
	return openat(dirfd, pathname, flags);
}
#endif

#endif /* ESP32 */

/*
	File
*/

struct xsFileRecord {
	int		fd;
};
typedef struct xsFileRecord xsFileRecord;
typedef struct xsFileRecord *xsFile;

void xs_fileposix_destructor(void *data)
{
	xsFile f = data;
	if (f)
		close(f->fd);
}

#define getFile(slot) ((xsFile)xsmcGetHostChunkValidate(slot, xs_fileposix_destructor))->fd

void xs_fileposix(xsMachine *the)
{
	xsUnknownError("use openFile");
}

void xs_fileposix_close(xsMachine *the)
{
	if (!xsGetHostChunkIf(xsThis)) 
		return;
		
	close(getFile(xsThis));
	xsmcSetHostData(xsThis, NULL);
}

void xs_fileposix_read(xsMachine *the)
{
	int fd = getFile(xsThis);
	void *buffer;
	xsUnsignedValue length;
	int position = xsmcToInteger(xsArg(1));
	uint8_t returnLength = 0;

	int type = xsmcTypeOf(xsArg(0));
	if ((xsIntegerType == type) || (xsNumberType == type)) {
 		length = xsmcToInteger(xsArg(0));
		xsmcSetArrayBufferResizable(xsResult, NULL, length, length);
		xsArg(0) = xsResult;
		buffer = xsmcToArrayBuffer(xsResult);
	}
	else {
		xsResult = xsArg(0);
		xsmcGetBufferWritable(xsResult, &buffer, &length);
		returnLength = 1;
	}

	int result = pread(fd, buffer, length, position);
	throwIf(result);

	if (returnLength)
		xsmcSetInteger(xsResult, result);
	else if ((xsUnsignedValue)result != length)
		xsmcSetArrayBufferLength(xsResult, result);
}

void xs_fileposix_write(xsMachine *the)
{
	int fd = getFile(xsThis);
	int position = xsmcToInteger(xsArg(1));
	void *buffer;
	xsUnsignedValue length;
	xsmcGetBufferWritable(xsArg(0), &buffer, &length);

	throwIf(pwrite(fd, buffer, length, position));
}

void xs_fileposix_status(xsMachine *the)
{
	int fd = getFile(xsThis);
	struct stat statbuf;

	throwIf(fstat(fd, &statbuf));

	xsResult = xsArg(0);

	xsmcVars(1);
	xsmcSetInteger(xsVar(0), statbuf.st_size);
	xsmcSet(xsResult, xsID_size, xsVar(0));

	xsmcSetInteger(xsVar(0), statbuf.st_mode);
	xsmcSet(xsResult, xsID_mode, xsVar(0));
}

void xs_fileposix_setSize(xsMachine *the)
{
	int fd = getFile(xsThis);
	throwIf(ftruncate(fd, xsmcToInteger(xsArg(0))));
}

void xs_fileposix_flush(xsMachine *the)
{
	int fd = getFile(xsThis);
	throwIf(fsync(fd));
}

/*
	Directory
*/

struct xsDirectoryRecord {
#if ESP32
	char	path[];
#else
	int		fd;
#endif
};
typedef struct xsDirectoryRecord xsDirectoryRecord;
typedef struct xsDirectoryRecord *xsDirectory;

void xs_directoryposix_destructor(void *data)
{
	xsDirectory d = data;
	if (d) {
#if ESP32
		c_free(d);
#else
		close(d->fd);
#endif
	}
}

#if ESP32
	#define getDirectory(slot) ((xsDirectory)xsmcGetHostDataValidate(slot, xs_directoryposix_destructor))

	#define resolvePath(directory, slot) _resolvePath(the, directory, &slot)
	static char *_resolvePath(xsMachine *the, xsDirectory directory, xsSlot *slot)
	{
		char *path = _getPath(the, slot);
		size_t directoryLength = c_strlen(directory->path);
		char *result = fxNewChunk(the, directoryLength + c_strlen(path) + 2);
		path = xsmcToString(*slot);
		c_strcpy(result, directory->path);
		c_strcat(result, "/");
		c_strcat(result, path);
		if ('/' == result[c_strlen(result) - 1])
			result[c_strlen(result) - 1] = 0;
		return result;
	}

	#define directoryStat(directory, path, statbuf, flags) stat(path, statbuf)
	#define directoryOpen(directory, path, flags) open(path, flags, kCreateFilePermissions)
	#define directoryMkdir(directory, path) mkdir(path, kCreateDirectoryPermissions)
#else
	#define getDirectory(slot) ((xsDirectory)xsmcGetHostChunkValidate(slot, xs_directoryposix_destructor))
	#define resolvePath(directory, slot) getPath(slot)
	#define directoryStat(directory, path, statbuf, flags) fstatat((directory)->fd, path, statbuf, flags)
	#define directoryOpen(directory, path, flags) openat((directory)->fd, path, flags, kCreateFilePermissions)
	#define directoryMkdir(directory, path) mkdirat((directory)->fd, path, kCreateDirectoryPermissions)
#endif

void xs_directoryposix(xsMachine *the)
{
	xsUnknownError("use openDirectory");
}

void xs_directoryposix_bootstrap(xsMachine *the)
{
	char *path;
	struct stat buf;

#if ESP32
	path = xsmcTest(xsArg(1)) ? xsmcToString(xsArg(1)) : "/sdcard";
	mountSDCard(the, path);
	throwIf(stat(path, &buf));
	if (!S_ISDIR(buf.st_mode))
		xsUnknownError("not directory");

	xsDirectory d = c_malloc(sizeof(xsDirectoryRecord) + c_strlen(path) + 1);
	if (!d)
		xsUnknownError("no memory");
	c_strcpy(d->path, path);
	xsmcSetHostData(xsArg(0), d);
#else
	xsDirectoryRecord d;
	
	if (xsmcTest(xsArg(1))) {
		path = xsmcToString(xsArg(1));
	}
	else {
		path = getenv("HOME");
		if (!path) {
			struct passwd* pwd = getpwuid(getuid());
			if (pwd)
			   path = pwd->pw_dir;
		}
    }
	
	throwIf(stat(path, &buf));
	if (!S_ISDIR(buf.st_mode))
		xsUnknownError("not directory");

	d.fd = open(path, O_RDONLY);
	throwIf(d.fd);

	xsmcSetHostChunk(xsArg(0), &d, sizeof(d));
#endif
}


void xs_directoryposix_close(xsMachine *the)
{
#if ESP32
	if (!xsmcGetHostData(xsThis))
		return;
	xs_directoryposix_destructor(xsmcGetHostData(xsThis));
	xsmcSetHostData(xsThis, NULL);
	xsSetHostDestructor(xsThis, NULL);
#else
	if (!xsGetHostChunkIf(xsThis))
		return;
	close(getDirectory(xsThis)->fd);
	xsmcSetHostData(xsThis, NULL);
#endif
}

void xs_directoryposix_openFile(xsMachine *the)
{
	xsDirectory directory = getDirectory(xsThis);

	xsResult = xsNewHostInstance(xsArg(1));

	xsmcVars(1);
	xsmcGet(xsVar(0), xsArg(0), xsID_mode);
	char *modestr;
	int mode;
	if (xsUndefinedType == xsmcTypeOf(xsVar(0)))
		modestr = "r";
	else
		modestr = xsmcToString(xsVar(0));
	if (!c_strcmp(modestr, "r"))
		mode = O_RDONLY;
	else if (!c_strcmp(modestr, "r+"))
		mode = O_RDWR;
	else if (!c_strcmp(modestr, "w"))
		mode = O_WRONLY | O_CREAT | O_TRUNC;
	else if (!c_strcmp(modestr, "w+"))
		mode = O_RDWR | O_CREAT | O_TRUNC;
	else
		xsUnknownError("invalid mode");

	xsmcGet(xsVar(0), xsArg(0), xsID_path);
	char *path = resolvePath(directory, xsVar(0));

	struct stat buf;
	int result = directoryStat(directory, path, &buf, kOpenDirFlags);
	if (result < 0) {
		if (!(mode & O_CREAT))
			throwIf(result);
	}
	else {
		if (!S_ISREG(buf.st_mode))
			xsUnknownError("not file");
	}

	xsFileRecord f;
	f.fd = directoryOpen(directory, path, mode);
	throwIf(f.fd);

	xsmcSetHostChunk(xsResult, &f, sizeof(f));
}

void xs_directoryposix_openDirectory(xsMachine *the)
{
	xsDirectory directory = getDirectory(xsThis);

	xsResult = xsNewHostInstance(xsArg(1));

	xsmcVars(1);
	xsmcGet(xsVar(0), xsArg(0), xsID_path);
	char *path = resolvePath(directory, xsVar(0));

	struct stat buf;
	throwIf(directoryStat(directory, path, &buf, 0));

	if (!S_ISDIR(buf.st_mode))
		xsUnknownError("not directory");

#if ESP32
	xsDirectory d = c_malloc(sizeof(xsDirectoryRecord) + c_strlen(path) + 1);
	if (!d)
		xsUnknownError("no memory");
	c_strcpy(d->path, path);
	xsmcSetHostData(xsResult, d);
#else
	xsDirectoryRecord d;
	d.fd = do_openat2(directory->fd, path, kOpenDirFlags);
	throwIf(d.fd);
	xsmcSetHostChunk(xsResult, &d, sizeof(d));
#endif
}

void xs_directoryposix_delete(xsMachine *the)
{
	xsDirectory directory = getDirectory(xsThis);
	char *path = resolvePath(directory, xsArg(0));

	struct stat buf;
	int result = directoryStat(directory, path, &buf, AT_SYMLINK_NOFOLLOW);
	if (result < 0) {
		if (ENOENT == errno) {
			xsmcSetFalse(xsResult);
			return;
		}
		throwIf(result);
	}

#if ESP32
	result = S_ISDIR(buf.st_mode) ? rmdir(path) : unlink(path);
#else
	result = unlinkat(directory->fd, path, S_ISDIR(buf.st_mode) ? AT_REMOVEDIR : 0);
#endif
	throwIf(result);
	xsmcSetTrue(xsResult);
}

void xs_directoryposix_move(xsMachine *the)
{
	xsDirectory directory = getDirectory(xsThis);
	xsmcToString(xsArg(0));		// coerce both before getPath to avoid problem if memory moves
	xsmcToString(xsArg(1));
	xsDirectory toDirectory = (xsmcArgc > 2) ? getDirectory(xsArg(2)) : directory;

#if ESP32
	char *resolved = resolvePath(directory, xsArg(0));
	char *fromPath = c_malloc(c_strlen(resolved) + 1);
	if (!fromPath)
		xsUnknownError("no memory");
	c_strcpy(fromPath, resolved);
	xsTry {
		char *toPath = resolvePath(toDirectory, xsArg(1));
		throwIf(rename(fromPath, toPath));
		c_free(fromPath);
	}
	xsCatch {
		c_free(fromPath);
		xsThrow(xsException);
	}
#else
	char *fromPath = getPath(xsArg(0));
	char *toPath = getPath(xsArg(1));
	fromPath = xsmcToString(xsArg(0));		// refresh pointer
	throwIf(renameat(directory->fd, fromPath, toDirectory->fd, toPath));
#endif
}

void xs_directoryposix_status(xsMachine *the)
{
	xsDirectory directory = getDirectory(xsThis);
	struct stat statbuf;
	int flags = 0;
	
	if (xsmcTest(xsArg(1))) {
		if (xsmcGet(xsResult, xsArg(1), xsID_resolveTarget)) {
			if (!xsmcTest(xsResult))
				flags = AT_SYMLINK_NOFOLLOW;
		}
	}

	xsResult = xsArg(2);
	xsmcVars(1);
	char *path = resolvePath(directory, xsArg(0));

	int result = directoryStat(directory, path, &statbuf, flags);
	if (result < 0) {
		if (ENOENT != errno)
			throwIf(result);

		xsmcSetInteger(xsVar(0), 0);
		xsmcSet(xsResult, xsID_mode, xsVar(0));
		return;
	}

	xsmcSetInteger(xsVar(0), statbuf.st_size);
	xsmcSet(xsResult, xsID_size, xsVar(0));

	xsmcSetInteger(xsVar(0), statbuf.st_mode);
	xsmcSet(xsResult, xsID_mode, xsVar(0));
}

void xs_directoryposix_createDirectory(xsMachine *the)
{
	xsDirectory directory = getDirectory(xsThis);
	char *path = resolvePath(directory, xsArg(0));

	int result = directoryMkdir(directory, path);
	if (result < 0) {
		if (EEXIST == errno) {
			struct stat buf;
			if ((0 == directoryStat(directory, path, &buf, 0)) && S_ISDIR(buf.st_mode)) {
				xsmcSetFalse(xsResult);
				return;
			}
		}
		throwIf(result);
	}
	xsmcSetTrue(xsResult);
}

void xs_directoryposix_createLink(xsMachine *the)
{
#if ESP32
	xsUnknownError("unsupported");
#else
	xsDirectory directory = getDirectory(xsThis);
	xsmcToString(xsArg(0));		// coerce both before getPath to avoid problem if memory moves
	xsmcToString(xsArg(1));
	char *path = getPath(xsArg(0));
	char *target = getPath(xsArg(1));

	throwIf(symlinkat(target, directory->fd, path));
#endif
}

void xs_directoryposix_readLink(xsMachine *the)
{
#if ESP32
	xsUnknownError("unsupported");
#else
	xsDirectory directory = getDirectory(xsThis);
	char *path = getPath(xsArg(0));
	char *s;

	xsmcSetStringBuffer(xsResult, NULL, 1024);
	s = xsmcToString(xsResult);
	path = xsmcToString(xsArg(0));
	ssize_t length = readlinkat(directory->fd, path, s, 1024 - 1);
	throwIf(length);
	s[length] = 0;
#endif
}

/*
	Scan
*/

struct xsScanRecord {
	int		fd;
	DIR		*dir;
};
typedef struct xsScanRecord xsScanRecord;
typedef struct xsScanRecord *xsScan;

void xs_directory_iterator_posix(xsMachine *the)
{
	xsScanRecord scan;
	xsDirectory directory = getDirectory(xsArg(0));
#if ESP32
	char *path;
	if (xsmcArgc > 1)
		path = resolvePath(directory, xsArg(1));
	else
		path = directory->path;
	scan.fd = -1;
	scan.dir = opendir(path);
#else
	if (xsmcArgc > 1) {
		char *path = getPath(xsArg(1));
		struct stat buf;
		throwIf(fstatat(directory->fd, path, &buf, 0));
		if (!S_ISDIR(buf.st_mode))
			xsUnknownError("not directory");
		scan.fd = openat(directory->fd, path, kOpenDirFlags);
	}
	else
		scan.fd = dup(directory->fd);
	throwIf(scan.fd);
	scan.dir = fdopendir(scan.fd);
#endif
	if (!scan.dir) {
#if !ESP32
		close(scan.fd);
#endif
		xsUnknownError(strerror(errno));
	}
	
	xsmcSetHostChunk(xsThis, &scan, sizeof(scan));
}

void xs_directory_iterator_posix_destructor(void *data)
{
	xsScan scan = data;
	if (!scan)
		return;
	if (scan->dir)
		closedir(scan->dir);	// closedir closes scan->fd (passed to fdopendir)
}

void xs_directory_iterator_posix_next(xsMachine *the)
{
	xsmcVars(2);
	xsmcSetTrue(xsVar(0));
	xsmcSetUndefined(xsVar(1));
	xsScan scan = (xsScan)xsmcGetHostChunkValidate(xsThis, xs_directory_iterator_posix_destructor);
	if (scan) {
		struct dirent *de = NULL;
		while ((de = readdir(scan->dir))) {
			if (c_strcmp(".", de->d_name) && c_strcmp("..", de->d_name))
				break;
		}
		if (de) {
			xsmcSetFalse(xsVar(0));
			xsmcSetString(xsVar(1), de->d_name);
		}
		else {
			xs_directory_iterator_posix_destructor(scan);
			xsmcSetHostChunk(xsThis, NULL, 0);
		}
	}
	xsResult = xsNewObject();
	xsmcDefine(xsResult, xsID_done, xsVar(0), xsDefault);
	xsmcDefine(xsResult, xsID_value, xsVar(1), xsDefault);
}

void xs_directory_iterator_posix_return(xsMachine *the)
{
	xsmcVars(2);
	xsmcSetTrue(xsVar(0));
	xsmcSetUndefined(xsVar(1));
	xsScan scan = (xsScan)xsmcGetHostChunkValidate(xsThis, xs_directory_iterator_posix_destructor);
	if (scan) {
		xs_directory_iterator_posix_destructor(scan);
		xsmcSetHostChunk(xsThis, NULL, 0);
	}
	xsResult = xsNewObject();
	xsmcDefine(xsResult, xsID_done, xsVar(0), xsDefault);
	xsmcDefine(xsResult, xsID_value, xsVar(1), xsDefault);
}

/*
	Stat
*/

void xs_stat_isFile(xsMachine *the)
{
	xsmcGet(xsResult, xsThis, xsID_mode);
	xsmcSetBoolean(xsResult, S_ISREG(xsmcToInteger(xsResult)));
}

void xs_stat_isDirectory(xsMachine *the)
{
	xsmcGet(xsResult, xsThis, xsID_mode);
	xsmcSetBoolean(xsResult, S_ISDIR(xsmcToInteger(xsResult)));
}

void xs_stat_isSymbolicLink(xsMachine *the)
{
	xsmcGet(xsResult, xsThis, xsID_mode);
	xsmcSetBoolean(xsResult, S_ISLNK(xsmcToInteger(xsResult)));
}
