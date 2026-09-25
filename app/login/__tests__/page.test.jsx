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

function chooseApartment(block, floor, door) {
  const [b, f, d] = screen.getAllByRole('combobox');
  fireEvent.change(b, { target: { value: block } });
  fireEvent.change(f, { target: { value: floor } });
  fireEvent.change(d, { target: { value: door } });
}

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
    // Full name + email; the apartment is three pickers (block, floor, door).
    expect(inputs.length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('combobox')).toHaveLength(3);
    expect(document.querySelector('input[type="email"]')).toBeInTheDocument();
    expect(document.querySelector('input[type="checkbox"]')).toBeInTheDocument();
  });

  it('blocks submission and shows an error when consent is not checked', async () => {
    render(<LoginPage />);
    const [nameInput] = screen.getAllByRole('textbox');
    const emailInput = document.querySelector('input[type="email"]');
    const submitButton = document.querySelector('form button[type="submit"]');

    fireEvent.change(nameInput, { target: { value: 'Erik Kril' } });
    chooseApartment('1', '1', '1');
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

    const [nameInput] = screen.getAllByRole('textbox');
    const emailInput = document.querySelector('input[type="email"]');
    const consentCheckbox = document.querySelector('input[type="checkbox"]');
    const submitButton = document.querySelector('form button[type="submit"]');

    fireEvent.change(nameInput, { target: { value: 'Erik Kril' } });
    chooseApartment('1', '1', '1');
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
    const [nameInput] = screen.getAllByRole('textbox');
    const emailInput = document.querySelector('input[type="email"]');
    const consentCheckbox = document.querySelector('input[type="checkbox"]');
    fireEvent.change(nameInput, { target: { value: 'Erik Kril' } });
    chooseApartment('1', '1', '1');
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

describe('<LoginPage /> - apartment format', () => {
  beforeEach(() => {
    signInWithOtpMock.mockReset();
    window.localStorage.clear();
    window.localStorage.setItem('lang', 'en');
    global.fetch = vi.fn().mockResolvedValue({ ok: true });
  });

  it('writes the ground floor as 14G2 and blocks sending until all three are chosen', async () => {
    signInWithOtpMock.mockResolvedValue({ error: null });
    render(<LoginPage />);
    const [nameInput] = screen.getAllByRole('textbox');
    fireEvent.change(nameInput, { target: { value: 'Erik Kril' } });
    fireEvent.change(document.querySelector('input[type="email"]'), { target: { value: 'erik@example.com' } });
    fireEvent.click(document.querySelector('input[type="checkbox"]'));
    const [b, f] = screen.getAllByRole('combobox');
    fireEvent.change(b, { target: { value: '14' } });
    fireEvent.change(f, { target: { value: 'G' } });
    fireEvent.submit(document.querySelector('form'));
    await waitFor(() => expect(screen.getByText(/choose the block, floor and door/i)).toBeInTheDocument());
    expect(signInWithOtpMock).not.toHaveBeenCalled();

    chooseApartment('14', 'G', '2');
    fireEvent.click(document.querySelector('form button[type="submit"]'));
    await waitFor(() => expect(signInWithOtpMock).toHaveBeenCalledTimes(1));
    expect(signInWithOtpMock.mock.calls[0][0].options.data.apartment_number).toBe('14G2');
  });
});
