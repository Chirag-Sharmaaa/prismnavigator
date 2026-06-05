import type { Category } from "./supabase";

export type UserRole = "admin" | "scientist_e" | "manager" | "guest";

export interface AppUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  category_access: string[] | null;
  created_at?: string;
}

export type ProjectState = "Active" | "Suspended" | "Under Review" | "Closed" | "Completed";
export type ReportStatus = "Due" | "Received - Not Reviewed" | "Received - Reviewed";

export interface Project {
  id: string;
  title: string;
  category: Category;
  e_file_number: string | null;
  pi_name: string | null;
  institute: string | null;
  start_date: string | null;
  duration_years: number | null;
  total_sanctioned_amount: number | null;
  project_state: ProjectState | null;
  assigned_users: string[] | null;
  description: string | null;
  created_at: string;
  created_by: string | null;
  serial_number: string | null;
  file_number: string | null;
  eoffice_number: string | null;
  iris_id: string | null;
  contact_number: string | null;
  email_id: string | null;
  date_of_completion: string | null;
  institute_address: string | null;
  state: string | null;
  outcomes_publications: string | null;
  current_status_note: string | null;
  co_pi: string | null;
  department: string | null;
  broad_subject_area: string | null;
  remarks: string | null;
  total_amount_released: number | null;
  is_multicentre: boolean | null;
  centre_details: string | null;
}

export interface YearlyStatus {
  id: string;
  project_id: string;
  year_number: number;
  sanctioned_amount: number | null;
  amount_released: number | null;
  grant_released: boolean;
  report_status: ReportStatus;
  uc_submitted: boolean;
  extension_requested: boolean;
  financial_year: string | null;
  grant_sanctioned: boolean | null;
  hold_amount: number | null;
  hold_amount_released: boolean | null;
  grant_release_date: string | null;
}

export interface FYBudget {
  id: string;
  project_id: string;
  financial_year: string;
  required_budget: number | null;
  released_budget: number | null;
}

export interface StatusHistoryEntry {
  id: string;
  project_id: string;
  year_number: number | null;
  changed_field: string;
  old_value: string | null;
  new_value: string | null;
  changed_by: string | null;
  changed_by_name: string | null;
  timestamp: string;
}

export interface DocumentRow {
  id: string;
  project_id: string;
  filename: string;
  file_url: string;
  file_size: number | null;
  uploaded_by: string | null;
  uploaded_by_name: string | null;
  uploaded_at: string;
}

export interface CommentRow {
  id: string;
  project_id: string;
  content: string;
  author_id: string | null;
  author_name: string | null;
  created_at: string;
}
