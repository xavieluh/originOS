import { Controller, Get, Inject } from "@nestjs/common";
import { Public } from "./decorators.js";
import { AUTH, MAILER } from "./tokens.js";
import type { Auth } from "./auth.js";
import type { Mailer } from "../mail/mailer.js";

/** What sign-in can do on this deployment, so the UI never offers a flow that cannot complete. */
@Controller("v1/auth-config")
export class AuthConfigController {
  constructor(
    @Inject(AUTH) private readonly auth: Auth | null,
    @Inject(MAILER) private readonly mailer: Mailer,
  ) {}

  @Get()
  @Public()
  get() {
    return {
      accounts: this.auth ? "available" : "not_configured",
      emailDelivery: this.mailer.configured ? "configured" : "not_configured",
      methods: this.auth ? ["email_password", "passkey"] : [],
      secondFactors: this.auth ? ["totp", "backup_code"] : [],
    };
  }
}
