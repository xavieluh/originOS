import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query, Req } from "@nestjs/common";
import { JOB_STATUSES, ResumeDecision } from "@originos/contracts";
import type { FastifyRequest } from "fastify";
import { z } from "zod";
import {
  AcceptsBinaryBody,
  CorrelationId,
  CurrentPrincipal,
  CurrentTenant,
  type Principal,
  RequirePermission,
  type TenantContext,
  parse,
} from "../core/index.js";
import { JobsService } from "./jobs.service.js";
import { UploadsService } from "./uploads.service.js";

const UploadIdParam = z.string().regex(/^upl_[0-9a-hjkmnp-tv-z]{26}$/);
const JobIdParam = z.string().regex(/^job_[0-9a-hjkmnp-tv-z]{26}$/);
const JobStatusQuery = z.enum(JOB_STATUSES).optional();

const header = (req: FastifyRequest, name: string) => {
  const v = req.headers[name];
  return Array.isArray(v) ? v[0] : v;
};

/**
 * Files: upload (raw body, application/octet-stream; name and type in headers),
 * list, inspect, preview and download clean files through short-lived signed URLs.
 */
@Controller("v1/files")
export class FilesController {
  constructor(@Inject(UploadsService) private readonly uploads: UploadsService) {}

  @Post()
  @AcceptsBinaryBody()
  @RequirePermission("write", "files")
  create(
    @CurrentPrincipal() p: Principal,
    @CurrentTenant() t: TenantContext,
    @Req() req: FastifyRequest,
    @CorrelationId() c: string,
  ) {
    const length = header(req, "content-length");
    return this.uploads.create(
      p,
      t,
      {
        filename: header(req, "x-upload-filename"),
        declaredType: header(req, "x-upload-type"),
        contentLength: length !== undefined && /^\d+$/.test(length) ? Number(length) : null,
        body: req.body,
      },
      c,
    );
  }

  @Get()
  @RequirePermission("read", "files")
  list(@CurrentPrincipal() p: Principal, @CurrentTenant() t: TenantContext) {
    return this.uploads.list(p, t);
  }

  @Get(":id")
  @RequirePermission("read", "files")
  get(
    @CurrentPrincipal() p: Principal,
    @CurrentTenant() t: TenantContext,
    @Param("id") id: string,
  ) {
    return this.uploads.get(p, t, parse(UploadIdParam, id));
  }

  @Get(":id/preview")
  @RequirePermission("read", "files")
  preview(
    @CurrentPrincipal() p: Principal,
    @CurrentTenant() t: TenantContext,
    @Param("id") id: string,
  ) {
    return this.uploads.preview(p, t, parse(UploadIdParam, id));
  }

  @Post(":id/download")
  @HttpCode(200)
  @RequirePermission("read", "files")
  download(
    @CurrentPrincipal() p: Principal,
    @CurrentTenant() t: TenantContext,
    @Param("id") id: string,
    @CorrelationId() c: string,
  ) {
    return this.uploads.download(p, t, parse(UploadIdParam, id), c);
  }
}

/** Background jobs: dead-letter review, cancellation and human waits. Owners and admins. */
@Controller("v1/organization/jobs")
export class JobsController {
  constructor(@Inject(JobsService) private readonly jobs: JobsService) {}

  @Get()
  @RequirePermission("read", "jobs")
  list(
    @CurrentPrincipal() p: Principal,
    @CurrentTenant() t: TenantContext,
    @Query("status") status: string | undefined,
  ) {
    return this.jobs.list(p, t, parse(JobStatusQuery, status));
  }

  @Post(":id/retry")
  @HttpCode(200)
  @RequirePermission("admin", "jobs")
  retry(
    @CurrentPrincipal() p: Principal,
    @CurrentTenant() t: TenantContext,
    @Param("id") id: string,
    @CorrelationId() c: string,
  ) {
    return this.jobs.retry(p, t, parse(JobIdParam, id), c);
  }

  @Post(":id/cancel")
  @HttpCode(200)
  @RequirePermission("admin", "jobs")
  cancel(
    @CurrentPrincipal() p: Principal,
    @CurrentTenant() t: TenantContext,
    @Param("id") id: string,
    @CorrelationId() c: string,
  ) {
    return this.jobs.cancel(p, t, parse(JobIdParam, id), c);
  }

  @Post(":id/resume")
  @HttpCode(200)
  @RequirePermission("admin", "jobs")
  resume(
    @CurrentPrincipal() p: Principal,
    @CurrentTenant() t: TenantContext,
    @Param("id") id: string,
    @Body() body: unknown,
    @CorrelationId() c: string,
  ) {
    return this.jobs.resume(p, t, parse(JobIdParam, id), parse(ResumeDecision.strict(), body), c);
  }
}
