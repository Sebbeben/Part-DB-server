<?php

declare(strict_types=1);

/*
 * This file is part of Part-DB (https://github.com/Part-DB/Part-DB-symfony).
 *
 *  Copyright (C) 2019 - 2022 Jan Böhmer (https://github.com/jbtronics)
 *
 *  This program is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU Affero General Public License as published
 *  by the Free Software Foundation, either version 3 of the License, or
 *  (at your option) any later version.
 *
 *  This program is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU Affero General Public License for more details.
 *
 *  You should have received a copy of the GNU Affero General Public License
 *  along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */
namespace App\Controller;

use App\Entity\Parts\Part;
use App\Services\Attachments\AttachmentSubmitHandler;
use App\Services\Attachments\AttachmentURLGenerator;
use App\Services\Attachments\BuiltinAttachmentsFinder;
use App\Services\Doctrine\DBInfoHelper;
use App\Services\Doctrine\NatsortDebugHelper;
use App\Services\System\GitVersionInfoProvider;
use App\Services\System\UpdateAvailableFacade;
use App\Settings\AppSettings;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Runtime\SymfonyRuntime;

#[Route(path: '/tools')]
class ToolsController extends AbstractController
{
    #[Route(path: '/reel_calc', name: 'tools_reel_calculator')]
    public function reelCalculator(): Response
    {
        $this->denyAccessUnlessGranted('@tools.reel_calculator');

        return $this->render('tools/reel_calculator/reel_calculator.html.twig');
    }

    #[Route(path: '/server_infos', name: 'tools_server_infos')]
    public function systemInfos(GitVersionInfoProvider $versionInfo, DBInfoHelper $DBInfoHelper, NatsortDebugHelper $natsortDebugHelper,
        AttachmentSubmitHandler $attachmentSubmitHandler, UpdateAvailableFacade $updateAvailableManager,
        AppSettings $settings): Response
    {
        $this->denyAccessUnlessGranted('@system.server_infos');

        return $this->render('tools/server_infos/server_infos.html.twig', [
            //Part-DB section
            'git_branch' => $versionInfo->getBranchName(),
            'git_commit' => $versionInfo->getCommitHash(),
            'default_locale' => $settings->system->localization->locale,
            'default_timezone' => $settings->system->localization->timezone,
            'default_currency' => $settings->system->localization->baseCurrency,
            'default_theme' => $settings->system->customization->theme,
            'enabled_locales' => $this->getParameter('partdb.locale_menu'),
            'demo_mode' => $this->getParameter('partdb.demo_mode'),
            'use_gravatar' => $settings->system->privacy->useGravatar,
            'gdpr_compliance' => $this->getParameter('partdb.gdpr_compliance'),
            'email_password_reset' => $this->getParameter('partdb.users.email_pw_reset'),
            'environment' => $this->getParameter('kernel.environment'),
            'is_debug' => $this->getParameter('kernel.debug'),
            'email_sender' => $this->getParameter('partdb.mail.sender_email'),
            'email_sender_name' => $this->getParameter('partdb.mail.sender_name'),
            'allow_attachments_downloads' => $settings->system->attachments->allowDownloads,
            'detailed_error_pages' => $this->getParameter('partdb.error_pages.show_help'),
            'error_page_admin_email' => $this->getParameter('partdb.error_pages.admin_email'),
            'configured_max_file_size' => $settings->system->attachments->maxFileSize,
            'effective_max_file_size' => $attachmentSubmitHandler->getMaximumAllowedUploadSize(),
            'saml_enabled' => $this->getParameter('partdb.saml.enabled'),

            //PHP section
            'php_version' => PHP_VERSION,
            'php_uname' => php_uname('a'),
            'php_sapi' => PHP_SAPI,
            'php_bit_size' => PHP_INT_SIZE * 8,
            'php_extensions' => [...get_loaded_extensions()],
            'php_opcache_enabled' => ini_get('opcache.enable'),
            'php_upload_max_filesize' => ini_get('upload_max_filesize'),
            'php_post_max_size' => ini_get('post_max_size'),
            'kernel_runtime_environment' => $this->getParameter('kernel.runtime_environment'),
            'kernel_runtime_mode' => $this->getParameter('kernel.runtime_mode'),
            'kernel_runtime' => $_SERVER['APP_RUNTIME'] ?? $_ENV['APP_RUNTIME'] ?? SymfonyRuntime::class,

            //DB section
            'db_type' => $DBInfoHelper->getDatabaseType() ?? 'Unknown',
            'db_version' => $DBInfoHelper->getDatabaseVersion() ?? 'Unknown',
            'db_size' => $DBInfoHelper->getDatabaseSize(),
            'db_name' => $DBInfoHelper->getDatabaseName() ?? 'Unknown',
            'db_user' => $DBInfoHelper->getDatabaseUsername() ?? 'Unknown',
            'db_natsort_method' => $natsortDebugHelper->getNaturalSortMethod(),
            'db_natsort_slow_allowed' => $natsortDebugHelper->isSlowNaturalSortAllowed(),

            //New version section
            'new_version_available' => $updateAvailableManager->isUpdateAvailable(),
            'new_version' => $updateAvailableManager->getLatestVersionString(),
            'new_version_url' => $updateAvailableManager->getLatestVersionUrl(),
        ]);
    }

    #[Route(path: '/builtin_footprints', name: 'tools_builtin_footprints_viewer')]
    public function builtInFootprintsViewer(BuiltinAttachmentsFinder $builtinAttachmentsFinder, AttachmentURLGenerator $urlGenerator): Response
    {
        $this->denyAccessUnlessGranted('@tools.builtin_footprints_viewer');

        $grouped_footprints = $builtinAttachmentsFinder->getListOfFootprintsGroupedByFolder();
        $grouped_footprints = array_map(static fn($group) => array_map(static fn($placeholder_filepath) => [
            'filename' => basename((string) $placeholder_filepath),
            'assets_path' => $urlGenerator->placeholderPathToAssetPath($placeholder_filepath),
        ], $group), $grouped_footprints);

        return $this->render('tools/builtin_footprints_viewer/builtin_footprints_viewer.html.twig', [
            'grouped_footprints' => $grouped_footprints,
        ]);
    }

    #[Route(path: '/ic_logos', name: 'tools_ic_logos')]
    public function icLogos(): Response
    {
        $this->denyAccessUnlessGranted('@tools.ic_logos');

        return $this->render('tools/ic_logos/ic_logos.html.twig');
    }

    #[Route(path: '/value_calc', name: 'tools_value_calculator')]
    public function valueCalculator(Request $request, EntityManagerInterface $em): Response
    {
        $this->denyAccessUnlessGranted('@tools.value_calculator');

        //Optionally the calculator can be opened in the context of a part, to attach the generated image to it.
        $part = null;
        $partId = $request->query->getInt('part');
        if ($partId > 0) {
            $part = $em->find(Part::class, $partId);
            if ($part !== null) {
                $this->denyAccessUnlessGranted('edit', $part);
            }
        }

        $prefillOhms = null;
        $prefillFarads = null;
        if ($part !== null) {
            [$prefillOhms, $prefillFarads] = $this->guessPartValue($part);
        }

        return $this->render('tools/value_calculator/value_calculator.html.twig', [
            'part' => $part,
            'prefill_ohms' => $prefillOhms,
            'prefill_farads' => $prefillFarads,
        ]);
    }

    /**
     * Best-effort guess of a part's resistance (ohms) and/or capacitance (farads) from its
     * parameters, so the value calculator can pre-fill. Returns [ohms|null, farads|null].
     * Fully defensive: any failure yields [null, null] so the page always renders.
     *
     * @return array{0: float|null, 1: float|null}
     */
    private function guessPartValue(Part $part): array
    {
        //SI prefix -> factor. m (milli) vs M (mega) are handled case-sensitively below.
        $prefixes = ['p' => 1e-12, 'n' => 1e-9, 'u' => 1e-6, 'µ' => 1e-6, 'k' => 1e3, 'meg' => 1e6, 'g' => 1e9];
        $factorFor = static function (string $prefix) use ($prefixes): float {
            $prefix = trim($prefix);
            if ($prefix === '' || $prefix === 'M') {
                return $prefix === 'M' ? 1e6 : 1.0;
            }
            if ($prefix === 'm') {
                return 1e-3;
            }
            return $prefixes[mb_strtolower($prefix)] ?? 1.0;
        };

        $ohms = null;
        $farads = null;

        try {
            foreach ($part->getParameters() as $param) {
                $name = mb_strtolower($param->getName());
                $unit = trim($param->getUnit() ?? '');

                $isRes = preg_match('/resist|widerstand|ohm/u', $name) === 1
                    || str_contains($unit, 'Ω') || stripos($unit, 'ohm') !== false;
                //Capacitance unit is an optional SI prefix followed by the farad symbol (F, pF, nF, µF, mF …).
                $isCap = preg_match('/capacit|kapazit|farad/u', $name) === 1
                    || preg_match('/^(meg|[pnuµmkMg])?F$/u', $unit) === 1;

                if (!$isRes && !$isCap) {
                    continue;
                }

                //The number lives in value_typical; its SI prefix is baked into the unit string
                //(e.g. value_typical=4.7, unit="kΩ" -> 4700 Ω), so multiply the two.
                $num = $param->getValueTypical();
                if ($num === null || $num <= 0) {
                    continue;
                }

                $prefix = (string) preg_replace('/(Ω|ohms?|F|farads?)$/iu', '', $unit);
                $value = $num * $factorFor($prefix);

                if ($isRes && $ohms === null) {
                    $ohms = $value;
                } elseif ($isCap && $farads === null) {
                    $farads = $value;
                }
            }
        } catch (\Throwable) {
            return [null, null];
        }

        return [$ohms, $farads];
    }
}
