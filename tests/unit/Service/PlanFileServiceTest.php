<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 Malte Leonard Herz
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\Psp\Tests\unit\Service;

use OCA\Psp\Exception\ConflictException;
use OCA\Psp\Exception\PlanException;
use OCA\Psp\Service\PlanFileService;
use OCP\Files\File;
use OCP\Files\Folder;
use OCP\Files\IRootFolder;
use OCP\Files\NotFoundException;
use OCP\IUser;
use OCP\IUserSession;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;

final class PlanFileServiceTest extends TestCase {
	private const PLAN = '{"format":"nextcloud-psp","schemaVersion":1,"meta":{},"nodes":[]}';

	private IRootFolder&MockObject $rootFolder;
	private IUserSession&MockObject $userSession;
	private Folder&MockObject $userFolder;
	private PlanFileService $service;

	protected function setUp(): void {
		$user = $this->createMock(IUser::class);
		$user->method('getUID')->willReturn('alice');
		$this->userSession = $this->createMock(IUserSession::class);
		$this->userSession->method('getUser')->willReturn($user);
		$this->userFolder = $this->createMock(Folder::class);
		$this->userFolder->method('getRelativePath')->willReturnCallback(
			static fn (string $path): string => substr($path, strlen('/alice/files')),
		);
		$this->rootFolder = $this->createMock(IRootFolder::class);
		$this->rootFolder->method('getUserFolder')->with('alice')->willReturn($this->userFolder);
		$this->service = new PlanFileService($this->rootFolder, $this->userSession);
	}

	private function file(string $name = 'Plan.psp', string $etag = 'e1', bool $updateable = true): File&MockObject {
		$file = $this->createMock(File::class);
		$file->method('getId')->willReturn(42);
		$file->method('getName')->willReturn($name);
		$file->method('getPath')->willReturn('/alice/files/Projekte/' . $name);
		$file->method('getEtag')->willReturn($etag);
		$file->method('getMTime')->willReturn(1000);
		$file->method('isReadable')->willReturn(true);
		$file->method('isUpdateable')->willReturn($updateable);
		$file->method('getContent')->willReturn(self::PLAN);
		return $file;
	}

	private function expectStatus(int $status, callable $action): void {
		try {
			$action();
		} catch (PlanException $e) {
			$this->assertSame($status, $e->getStatus());
			return;
		}
		$this->fail("Expected PlanException with status $status");
	}

	public function testLoadReturnsContentAndMetadata(): void {
		$this->userFolder->method('getFirstNodeById')->with(42)->willReturn($this->file());

		$this->assertSame([
			'fileId' => 42,
			'name' => 'Plan.psp',
			'path' => '/Projekte/Plan.psp',
			'etag' => 'e1',
			'mtime' => 1000,
			'canEdit' => true,
			'content' => self::PLAN,
		], $this->service->load(42));
	}

	public function testLoadRejectsMissingFolderAndOtherFiles(): void {
		$this->userFolder->method('getFirstNodeById')->willReturnMap([
			[1, null],
			[2, $this->createMock(Folder::class)],
			[3, $this->file('notes.txt')],
		]);

		$this->expectStatus(404, fn () => $this->service->load(1));
		$this->expectStatus(404, fn () => $this->service->load(2));
		$this->expectStatus(415, fn () => $this->service->load(3));
	}

	public function testLoadNeedsALoggedInUser(): void {
		$session = $this->createMock(IUserSession::class);
		$session->method('getUser')->willReturn(null);
		$service = new PlanFileService($this->rootFolder, $session);

		$this->expectStatus(401, fn () => $service->load(42));
	}

	public function testSaveWritesWhenTheEtagMatches(): void {
		$file = $this->file();
		$file->expects($this->once())->method('putContent')->with(self::PLAN);
		$this->userFolder->method('getFirstNodeById')->willReturn($file);

		$this->assertSame('e1', $this->service->save(42, self::PLAN, 'e1')['etag']);
	}

	public function testSaveReportsAConflict(): void {
		$file = $this->file(etag: 'server');
		$file->expects($this->never())->method('putContent');
		$this->userFolder->method('getFirstNodeById')->willReturn($file);

		try {
			$this->service->save(42, self::PLAN, 'client');
			$this->fail('Expected a conflict');
		} catch (ConflictException $e) {
			$this->assertSame(409, $e->getStatus());
			$this->assertSame('server', $e->getCurrentEtag());
			$this->assertSame(1000, $e->getCurrentMtime());
		}
	}

	public function testForceOverwritesANewerVersion(): void {
		$file = $this->file(etag: 'server');
		$file->expects($this->once())->method('putContent');
		$this->userFolder->method('getFirstNodeById')->willReturn($file);

		$this->service->save(42, self::PLAN, 'client', true);
	}

	public function testSaveChecksPermissionAndContent(): void {
		$this->userFolder->method('getFirstNodeById')->willReturn($this->file(updateable: false));

		$this->expectStatus(403, fn () => $this->service->save(42, self::PLAN, 'e1'));
		$this->expectStatus(400, fn () => $this->service->save(42, '{"format":"other"}', 'e1'));
		$this->expectStatus(400, fn () => $this->service->save(42, 'not json', 'e1'));
	}

	public function testCreateAddsTheExtensionAndAvoidsExistingNames(): void {
		$folder = $this->createMock(Folder::class);
		$folder->method('isCreatable')->willReturn(true);
		$folder->method('getNonExistingName')->with('Miesmotte.psp')->willReturn('Miesmotte (2).psp');
		$folder->expects($this->once())->method('newFile')->with('Miesmotte (2).psp', self::PLAN)->willReturn($this->file('Miesmotte (2).psp'));
		$this->userFolder->method('get')->with('/Projekte')->willReturn($folder);

		$this->assertSame('Miesmotte (2).psp', $this->service->create('/Projekte', ' Miesmotte ', self::PLAN)['name']);
	}

	public function testCreateInTheRootFolder(): void {
		$this->userFolder->method('isCreatable')->willReturn(true);
		$this->userFolder->method('getNonExistingName')->willReturnArgument(0);
		$this->userFolder->expects($this->once())->method('newFile')->with('Plan.psp')->willReturn($this->file());

		$this->service->create('/', 'Plan', self::PLAN);
	}

	public function testCreateRejectsBadInput(): void {
		$this->userFolder->method('get')->willThrowException(new NotFoundException());

		$this->expectStatus(400, fn () => $this->service->create('/', '', self::PLAN));
		$this->expectStatus(400, fn () => $this->service->create('/', 'a/b', self::PLAN));
		$this->expectStatus(400, fn () => $this->service->create('/', 'x', '{}'));
		$this->expectStatus(404, fn () => $this->service->create('/missing', 'x', self::PLAN));
	}

	public function testCreateNeedsAWritableFolder(): void {
		$readOnly = $this->createMock(Folder::class);
		$readOnly->method('isCreatable')->willReturn(false);
		$this->userFolder->method('get')->willReturn($readOnly);

		$this->expectStatus(403, fn () => $this->service->create('/Geteilt', 'x', self::PLAN));
	}

	public function testCreateNeedsAFolder(): void {
		$this->userFolder->method('get')->willReturn($this->file());

		$this->expectStatus(404, fn () => $this->service->create('/Plan.psp', 'x', self::PLAN));
	}
}
