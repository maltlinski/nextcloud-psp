<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 Malte Leonard Herz
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\Psp\Service;

use OCA\Psp\Exception\ConflictException;
use OCA\Psp\Exception\PlanException;
use OCP\AppFramework\Http;
use OCP\Files\File;
use OCP\Files\Folder;
use OCP\Files\IRootFolder;
use OCP\Files\NotFoundException;
use OCP\Files\NotPermittedException;
use OCP\IUserSession;
use OCP\Lock\LockedException;

/**
 * Reads and writes .psp files of the current user, addressed by file id.
 *
 * Saving is guarded by the file's ETag: a client sends the ETag it loaded,
 * and the write is refused with a conflict when the file has changed since.
 */
class PlanFileService {
	public const EXTENSION = '.psp';
	public const MIME_TYPE = 'application/x-psp+json';
	public const MAX_SIZE = 10 * 1024 * 1024;

	/** @psalm-suppress PossiblyUnusedMethod */
	public function __construct(
		private IRootFolder $rootFolder,
		private IUserSession $userSession,
	) {
	}

	/**
	 * @return array{fileId: int, name: string, path: string, etag: string, mtime: int, canEdit: bool, content: string}
	 * @throws PlanException
	 */
	public function load(int $fileId): array {
		$file = $this->getFile($fileId);
		try {
			$content = $file->getContent();
		} catch (NotPermittedException|LockedException) {
			throw new PlanException('The file cannot be read right now', Http::STATUS_LOCKED);
		}
		return $this->describe($file) + ['content' => $content];
	}

	/**
	 * Writes the content when `$etag` still matches the file on the server.
	 * Pass `$force = true` to overwrite a newer version on purpose.
	 *
	 * @return array{fileId: int, name: string, path: string, etag: string, mtime: int, canEdit: bool}
	 * @throws PlanException
	 */
	public function save(int $fileId, string $content, string $etag, bool $force = false): array {
		$this->assertValidContent($content);
		$file = $this->getFile($fileId);
		if (!$file->isUpdateable()) {
			throw new PlanException('You are not allowed to change this file', Http::STATUS_FORBIDDEN);
		}
		if (!$force && $file->getEtag() !== $etag) {
			throw new ConflictException($file->getEtag(), $file->getMTime());
		}
		try {
			$file->putContent($content);
		} catch (NotPermittedException) {
			throw new PlanException('You are not allowed to change this file', Http::STATUS_FORBIDDEN);
		} catch (LockedException) {
			throw new PlanException('The file is being changed by someone else right now', Http::STATUS_LOCKED);
		}
		return $this->describe($this->getFile($fileId));
	}

	/**
	 * Creates a new plan in a folder of the current user. An existing name gets a suffix.
	 *
	 * @return array{fileId: int, name: string, path: string, etag: string, mtime: int, canEdit: bool}
	 * @throws PlanException
	 */
	public function create(string $directory, string $name, string $content): array {
		$this->assertValidContent($content);
		$name = trim($name);
		if ($name === '' || str_contains($name, '/') || str_contains($name, '\\')) {
			throw new PlanException('Invalid file name');
		}
		if (!str_ends_with(strtolower($name), self::EXTENSION)) {
			$name .= self::EXTENSION;
		}
		$userFolder = $this->getUserFolder();
		try {
			$folder = $directory === '' || $directory === '/' ? $userFolder : $userFolder->get($directory);
		} catch (NotFoundException) {
			throw new PlanException('Folder not found', Http::STATUS_NOT_FOUND);
		}
		if (!$folder instanceof Folder) {
			throw new PlanException('Folder not found', Http::STATUS_NOT_FOUND);
		}
		if (!$folder->isCreatable()) {
			throw new PlanException('You are not allowed to create files in this folder', Http::STATUS_FORBIDDEN);
		}
		try {
			$file = $folder->newFile($folder->getNonExistingName($name), $content);
		} catch (NotPermittedException) {
			throw new PlanException('You are not allowed to create files in this folder', Http::STATUS_FORBIDDEN);
		}
		return $this->describe($file);
	}

	private function getUserFolder(): Folder {
		$user = $this->userSession->getUser();
		if ($user === null) {
			throw new PlanException('Not logged in', Http::STATUS_UNAUTHORIZED);
		}
		return $this->rootFolder->getUserFolder($user->getUID());
	}

	/**
	 * @throws PlanException
	 */
	private function getFile(int $fileId): File {
		$node = $this->getUserFolder()->getFirstNodeById($fileId);
		if (!$node instanceof File) {
			throw new PlanException('File not found', Http::STATUS_NOT_FOUND);
		}
		if (!str_ends_with(strtolower($node->getName()), self::EXTENSION)) {
			throw new PlanException('This is not a .psp file', Http::STATUS_UNSUPPORTED_MEDIA_TYPE);
		}
		if (!$node->isReadable()) {
			throw new PlanException('File not found', Http::STATUS_NOT_FOUND);
		}
		return $node;
	}

	/**
	 * @throws PlanException
	 */
	private function assertValidContent(string $content): void {
		if (strlen($content) > self::MAX_SIZE) {
			throw new PlanException('The plan is too large', Http::STATUS_REQUEST_ENTITY_TOO_LARGE);
		}
		$data = json_decode($content, true);
		if (!is_array($data) || ($data['format'] ?? null) !== 'nextcloud-psp') {
			throw new PlanException('The content is not a PSP document');
		}
	}

	/**
	 * @return array{fileId: int, name: string, path: string, etag: string, mtime: int, canEdit: bool}
	 */
	private function describe(File $file): array {
		$userFolder = $this->getUserFolder();
		return [
			'fileId' => $file->getId(),
			'name' => $file->getName(),
			'path' => $userFolder->getRelativePath($file->getPath()) ?? '/' . $file->getName(),
			'etag' => $file->getEtag(),
			'mtime' => $file->getMTime(),
			'canEdit' => $file->isUpdateable(),
		];
	}
}
