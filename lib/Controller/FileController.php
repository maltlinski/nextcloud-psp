<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 Malte Leonard Herz
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\Psp\Controller;

use OCA\Psp\Exception\ConflictException;
use OCA\Psp\Exception\PlanException;
use OCA\Psp\Service\PlanFileService;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\Attribute\ApiRoute;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\DataResponse;
use OCP\AppFramework\OCSController;
use OCP\IRequest;

/**
 * Load, save and create .psp files of the current user.
 *
 * @psalm-suppress UnusedClass
 */
class FileController extends OCSController {
	public function __construct(
		string $appName,
		IRequest $request,
		private PlanFileService $service,
	) {
		parent::__construct($appName, $request);
	}

	/**
	 * Load a plan with its content and ETag.
	 *
	 * @param int $fileId Id of the .psp file
	 */
	#[NoAdminRequired]
	#[ApiRoute(verb: 'GET', url: '/api/v1/files/{fileId}', requirements: ['fileId' => '\d+'])]
	public function load(int $fileId): DataResponse {
		try {
			return new DataResponse($this->service->load($fileId));
		} catch (PlanException $e) {
			return $this->error($e);
		}
	}

	/**
	 * Save a plan if nobody changed it since `etag` was loaded.
	 *
	 * @param int $fileId Id of the .psp file
	 * @param string $content Serialized plan
	 * @param string $etag ETag of the version the client edited
	 * @param bool $force Overwrite even if the file changed in between
	 */
	#[NoAdminRequired]
	#[ApiRoute(verb: 'PUT', url: '/api/v1/files/{fileId}', requirements: ['fileId' => '\d+'])]
	public function save(int $fileId, string $content, string $etag = '', bool $force = false): DataResponse {
		try {
			return new DataResponse($this->service->save($fileId, $content, $etag, $force));
		} catch (PlanException $e) {
			return $this->error($e);
		}
	}

	/**
	 * Create a new plan.
	 *
	 * @param string $directory Folder path relative to the user's files, e.g. "/Projekte"
	 * @param string $name File name; ".psp" is added when missing
	 * @param string $content Serialized plan
	 */
	#[NoAdminRequired]
	#[ApiRoute(verb: 'POST', url: '/api/v1/files')]
	public function create(string $directory, string $name, string $content): DataResponse {
		try {
			return new DataResponse($this->service->create($directory, $name, $content), Http::STATUS_CREATED);
		} catch (PlanException $e) {
			return $this->error($e);
		}
	}

	private function error(PlanException $e): DataResponse {
		$data = ['message' => $e->getMessage()];
		if ($e instanceof ConflictException) {
			$data['etag'] = $e->getCurrentEtag();
			$data['mtime'] = $e->getCurrentMtime();
		}
		return new DataResponse($data, $e->getStatus());
	}
}
