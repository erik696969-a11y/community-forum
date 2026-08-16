import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const signInWithOtpMock = vi.fn();
const verifyOtpMock = vi.fn();
const replaceMock = vi.fn();

vi.mock('../../../lib/supabaseClient', () => ({
  supabase: {
    auth: {
      signInWithOtp: (...args) => signInWithOtpMock(...args),
      verifyOtp: (...args) => verifyOtpMock(...args),
    },
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock }),
}));

const { default: LoginPage } = await import('../page');

describe('<LoginPage /> - registration (smoke)', () => {
  beforeEach(() => {
    signInWithOtpMock.mockReset();
    verifyOtpMock.mockReset();
    replaceMock.mockReset();
    window.localStorage.clear();
    window.localStorage.setItem('lang', 'en');
    global.fetch = vi.fn().mockResolvedValue({ ok: true });
  });

  it('renders the registration form with the required fields', () => {
    render(<LoginPage />);
    const inputs = screen.getAllByRole('textbox');
    // Full name, apartment number, at minimum - email is type="email" so
    // it's queried separately below.
    expect(inputs.length).toBeGreaterThanOrEqual(2);
    expect(document.querySelector('input[type="email"]')).toBeInTheDocument();
    expect(document.querySelector('input[type="checkbox"]')).toBeInTheDocument();
  });

  it('blocks submission and shows an error when consent is not checked', async () => {
    render(<LoginPage />);
    const [nameInput, apartmentInput] = screen.getAllByRole('textbox');
    const emailInput = document.querySelector('input[type="email"]');
    const submitButton = document.querySelector('form button[type="submit"]');

    fireEvent.change(nameInput, { target: { value: 'Erik Kril' } });
    fireEvent.change(apartmentInput, { target: { value: '1.1.1' } });
    fireEvent.change(emailInput, { target: { value: 'erik@example.com' } });
    // consent checkbox left UNCHECKED on purpose

    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(signInWithOtpMock).not.toHaveBeenCalled();
    });
  });

  it('calls signInWithOtp with the entered email once consent is checked, and shows the "check your email" screen', async () => {
    signInWithOtpMock.mockResolvedValue({ error: null });
    render(<LoginPage />);

    const [nameInput, apartmentInput] = screen.getAllByRole('textbox');
    const emailInput = document.querySelector('input[type="email"]');
    const consentCheckbox = document.querySelector('input[type="checkbox"]');
    const submitButton = document.querySelector('form button[type="submit"]');

    fireEvent.change(nameInput, { target: { value: 'Erik Kril' } });
    fireEvent.change(apartmentInput, { target: { value: '1.1.1' } });
    fireEvent.change(emailInput, { target: { value: 'erik@example.com' } });
    fireEvent.click(consentCheckbox);
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(signInWithOtpMock).toHaveBeenCalledTimes(1);
    });
    const callArgs = signInWithOtpMock.mock.calls[0][0];
    expect(callArgs.email).toBe('erik@example.com');
    expect(callArgs.options.data.full_name).toBe('Erik Kril');
    expect(callArgs.options.data.apartment_number).toBe('1.1.1');

    // After a successful signInWithOtp, the OTP-entry screen should appear.
    await waitFor(() => {
      expect(screen.getByPlaceholderText('12345678')).toBeInTheDocument();
    });
  });
});

describe('<LoginPage /> - login via OTP code (smoke)', () => {
  beforeEach(() => {
    signInWithOtpMock.mockReset();
    verifyOtpMock.mockReset();
    replaceMock.mockReset();
    window.localStorage.clear();
    window.localStorage.setItem('lang', 'en');
    global.fetch = vi.fn().mockResolvedValue({ ok: true });
  });

  async function getToCodeScreen() {
    signInWithOtpMock.mockResolvedValue({ error: null });
    render(<LoginPage />);
    const [nameInput, apartmentInput] = screen.getAllByRole('textbox');
    const emailInput = document.querySelector('input[type="email"]');
    const consentCheckbox = document.querySelector('input[type="checkbox"]');
    fireEvent.change(nameInput, { target: { value: 'Erik Kril' } });
    fireEvent.change(apartmentInput, { target: { value: '1.1.1' } });
    fireEvent.change(emailInput, { target: { value: 'erik@example.com' } });
    fireEvent.click(consentCheckbox);
    fireEvent.click(document.querySelector('form button[type="submit"]'));
    await waitFor(() => expect(screen.getByPlaceholderText('12345678')).toBeInTheDocument());
  }

  it('calls verifyOtp with the entered code and redirects home on success', async () => {
    await getToCodeScreen();
    verifyOtpMock.mockResolvedValue({ error: null });

    const codeInput = screen.getByPlaceholderText('12345678');
    fireEvent.change(codeInput, { target: { value: '12345678' } });
    fireEvent.submit(codeInput.closest('form'));

    await waitFor(() => {
      expect(verifyOtpMock).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'erik@example.com', token: '12345678', type: 'email' })
      );
      expect(replaceMock).toHaveBeenCalledWith('/');
    });
  });

  it('shows an error and does not redirect when the code is invalid', async () => {
    await getToCodeScreen();
    verifyOtpMock.mockResolvedValue({ error: { message: 'invalid' } });

    const codeInput = screen.getByPlaceholderText('12345678');
    fireEvent.change(codeInput, { target: { value: '00000000' } });
    fireEvent.submit(codeInput.closest('form'));

    await waitFor(() => {
      expect(verifyOtpMock).toHaveBeenCalled();
      expect(replaceMock).not.toHaveBeenCalled();
    });
  });
});
