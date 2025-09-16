import { logger } from "./logger";

export interface PolicyFrame {
  type: "policy";
  schema_version: string;
  supersede_on_register?: boolean;
  max_job_bytes?: number;
}

export interface PolicyState {
  supersedeOnRegister: boolean;
  maxJobBytes: number | null;
}

export class PolicyManager {
  private policies: PolicyState;

  constructor() {
    this.policies = {
      supersedeOnRegister: false,
      maxJobBytes: null,
    };
  }

  applyPolicy(frame: PolicyFrame): void {
    if (typeof frame.supersede_on_register === "boolean") {
      this.policies.supersedeOnRegister = frame.supersede_on_register;
    }
    if (typeof frame.max_job_bytes === "number") {
      this.policies.maxJobBytes = frame.max_job_bytes;
    }
    logger.info("Policy updated", this.policies);
  }

  getPolicies(): Readonly<PolicyState> {
    return this.policies;
  }

  reset(): void {
    this.policies = {
      supersedeOnRegister: false,
      maxJobBytes: null,
    };
    logger.info("Policies reset to defaults");
  }

  shouldSupersedeOnRegister(): boolean {
    return this.policies.supersedeOnRegister;
  }
}
