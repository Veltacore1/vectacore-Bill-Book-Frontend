import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import StaffAttendance from "./StaffAttendance";

const mockStaffList = [
  {
    id: "1",
    name: "K. Rameshan",
    designation: "Master Weaver",
    salary: 28000,
    attendance: {},
  },
];

describe("StaffAttendance", () => {
  it("renders staff list and uses dynamic date", () => {
    render(
      <StaffAttendance
        staffList={mockStaffList}
        onAttendanceChange={() => {}}
      />
    );

    const today = new Date().toISOString().split("T")[0];
    expect(screen.getByText(today)).toBeInTheDocument();
    expect(screen.getByText("K. Rameshan")).toBeInTheDocument();
    expect(screen.getByText("Master Weaver")).toBeInTheDocument();
  });
});
